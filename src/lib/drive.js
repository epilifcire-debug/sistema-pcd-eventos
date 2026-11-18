// Documentos no Google Drive (via Edge Function google-drive)
import { supabase, urlDocumento } from './supabase'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive`

async function cabecalhos() {
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data.session?.access_token || ''}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

async function erroDe(r) {
  try { return (await r.json()).error || `Erro ${r.status}` } catch { return `Erro ${r.status}` }
}

export async function driveStatus() {
  const { data, error } = await supabase.rpc('google_status')
  if (error) return { conectado: false }
  return data || { conectado: false }
}

export async function driveAcao(body) {
  let r
  try {
    r = await fetch(BASE, {
      method: 'POST',
      headers: { ...(await cabecalhos()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Não foi possível falar com a função google-drive. Confira se ela foi publicada com esse nome.')
  }
  if (!r.ok) throw new Error(await erroDe(r))
  return r
}

// Envia arquivos para Documentos PcD/<nome do cadastro> e devolve a pasta vinculada
export async function enviarParaDrive({ id, nome, cpf, drive_pasta_id }, arquivos) {
  const fd = new FormData()
  fd.append('pessoa_id', id)
  fd.append('nome', nome)
  fd.append('cpf', cpf || '')
  if (drive_pasta_id) fd.append('pasta_id', drive_pasta_id)
  for (const a of arquivos) fd.append('arquivos', a, a.name)
  let r
  try {
    r = await fetch(BASE, { method: 'POST', headers: await cabecalhos(), body: fd })
  } catch {
    throw new Error('Não foi possível enviar ao Google Drive (função google-drive inacessível).')
  }
  if (!r.ok) throw new Error(await erroDe(r))
  return r.json() // { pasta_id, arquivos: [{ drive_id, nome, mime, tamanho }] }
}

export const linkPastaDrive = (id) => `https://drive.google.com/drive/folders/${id}`

// Abre um documento (Drive ou Supabase). A janela abre na hora do clique para o celular não bloquear.
export async function abrirDocumento(doc) {
  const janela = window.open('', '_blank')
  try {
    let url
    if (doc.drive_id) {
      const r = await driveAcao({ action: 'download', id: doc.drive_id })
      url = URL.createObjectURL(await r.blob())
    } else {
      url = await urlDocumento(doc.path)
    }
    if (!url) throw new Error('Documento não encontrado')
    if (janela) janela.location.href = url
    else window.location.href = url
  } catch (e) {
    janela?.close()
    throw e
  }
}
