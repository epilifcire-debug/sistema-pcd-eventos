import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && key)
export const supabase = configurado ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null

// Busca todas as linhas de uma tabela, em lotes de 1000 (sem limite de paginação)
export async function buscarTudo(tabela, select = '*', ordem = 'id') {
  const lote = 1000
  let de = 0
  const todos = []
  for (;;) {
    const { data, error } = await supabase.from(tabela).select(select).order(ordem).range(de, de + lote - 1)
    if (error) throw error
    todos.push(...data)
    if (data.length < lote) break
    de += lote
  }
  return todos
}

// ---------- URLs assinadas das fotos (bucket privado) ----------
const cache = new Map() // path -> { url, expira }
const fila = new Map() // path -> [resolve]
let timer = null

async function processarFila() {
  timer = null
  const paths = [...fila.keys()]
  const espera = new Map(fila)
  fila.clear()
  for (let i = 0; i < paths.length; i += 100) {
    const parte = paths.slice(i, i + 100)
    const { data } = await supabase.storage.from('fotos').createSignedUrls(parte, 3600)
    ;(data || []).forEach((r, idx) => {
      const p = parte[idx]
      const url = r.signedUrl || null
      if (url) cache.set(p, { url, expira: Date.now() + 3500 * 1000 })
      ;(espera.get(p) || []).forEach((res) => res(url))
    })
  }
}

export function urlFoto(path) {
  if (!path) return Promise.resolve(null)
  const c = cache.get(path)
  if (c && c.expira > Date.now()) return Promise.resolve(c.url)
  return new Promise((resolve) => {
    if (!fila.has(path)) fila.set(path, [])
    fila.get(path).push(resolve)
    if (!timer) timer = setTimeout(processarFila, 40)
  })
}

export const urlFotoCache = (path) => {
  const c = path && cache.get(path)
  return c && c.expira > Date.now() ? c.url : null
}

export async function urlDocumento(path) {
  const { data } = await supabase.storage.from('documentos').createSignedUrl(path, 600)
  return data?.signedUrl
}

// Reduz a foto antes de enviar (economiza espaço e deixa o app rápido no celular)
export async function comprimirImagem(file, max = 1200, qualidade = 0.82) {
  if (!file.type.startsWith('image/')) return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala)
  c.height = Math.round(bmp.height * escala)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', qualidade))
  return blob || file
}
