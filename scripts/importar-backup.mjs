#!/usr/bin/env node
// =====================================================================
// Importa o backup do Base44 (backup_pcd_*.zip extraído) para o Supabase.
//
// Uso (na pasta do projeto, no seu computador):
//   node --env-file=.env scripts/importar-backup.mjs <pasta-do-backup> [--simular] [--sem-usuarios] [--sem-arquivos]
//
//   --simular       só mostra o que seria importado (não grava nada)
//   --sem-usuarios  não cria as contas de usuário
//   --sem-arquivos  não copia fotos/documentos/imagens (mantém só os dados)
//
// Pode rodar mais de uma vez: tudo é "upsert" (atualiza o que já existe).
// Precisa no .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SENHA_PROVISORIA.
// =====================================================================
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const pasta = args.find((a) => !a.startsWith('--'))
const SIMULAR = args.includes('--simular')
const SEM_USUARIOS = args.includes('--sem-usuarios')
const SEM_ARQUIVOS = args.includes('--sem-arquivos') || SIMULAR

if (!pasta) {
  console.error('Uso: node --env-file=.env scripts/importar-backup.mjs <pasta-do-backup> [--simular]')
  process.exit(1)
}
const arqDados = path.join(pasta, 'dados_completos.json')
if (!fs.existsSync(arqDados)) {
  console.error(`Não achei ${arqDados}. Extraia o ZIP do backup e aponte para a pasta.`)
  process.exit(1)
}
const D = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const log = []
const anotar = (s) => { log.push(s); console.log(s) }

// ---------------------------------------------------------------------
// Transformação (Base44 -> modelo novo)
// ---------------------------------------------------------------------
const ts = (s) => (s ? (s.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') : null)
const vazioNull = (v) => (v == null || String(v).trim() === '' ? null : v)

export function transformar(D) {
  const eventos = (D.Evento || []).map((e) => ({
    id: e.id, nome: (e.nome || '').trim() || 'Sem nome', data: e.data || null, local: vazioNull(e.local),
    descricao: vazioNull(e.descricao), ativo: e.ativo !== false, imagem_url: e.imagem_url || null,
    created_at: ts(e.created_date), updated_at: ts(e.updated_date),
  }))
  const idsEventos = new Set(eventos.map((e) => e.id))

  const pessoas = (D.Pessoa || []).map((p) => ({
    id: p.id, nome: (p.nome || '').trim() || 'Sem nome', cpf: p.cpf || '', telefone: vazioNull(p.telefone),
    email: vazioNull(p.email), tipo_deficiencia: vazioNull(p.tipo_deficiencia), cid: vazioNull(p.cid),
    acompanhante: vazioNull(p.acompanhante), cpf_acompanhante: vazioNull(p.cpf_acompanhante),
    observacoes: vazioNull(p.observacoes), status: p.status === 'inativo' ? 'inativo' : 'ativo',
    foto_path: null, documentos: [],
    created_at: ts(p.created_date), updated_at: ts(p.updated_date),
    _foto_url: p.foto_url || null, _documentos: p.documentos || [],
  }))

  // motivo de cancelamento a partir do histórico
  const motivoHist = new Map()
  for (const h of D.HistoricoCancelamento || []) motivoHist.set(`${h.pessoa_id}|${h.evento_id}`, h)

  const inscricoes = []
  const ignoradas = []
  for (const p of D.Pessoa || []) {
    const m = new Map()
    const pega = (ev) => {
      if (!idsEventos.has(ev)) { ignoradas.push(`${p.nome} -> evento ${ev} não existe mais`); return null }
      if (!m.has(ev)) m.set(ev, { pessoa_id: p.id, evento_id: ev, status: 'cancelada', motivo_cancelamento: 'importado',
        inscrito_em: ts(p.created_date), conferido: false, conferido_em: null, conferido_por: null, abada: false, abada_em: null, abada_por: null })
      return m.get(ev)
    }
    for (const ev of p.eventos || []) { const r = pega(ev); if (r) { r.status = 'ativa'; r.motivo_cancelamento = null } }
    for (const ev of p.eventos_cancelados || []) {
      const r = pega(ev)
      if (r && r.status !== 'ativa') {
        const h = motivoHist.get(`${p.id}|${ev}`)
        r.motivo_cancelamento = h ? (h.motivo || 'expired_cancelled_event') : 'manual'
        r.cancelado_em = h?.data_alteracao || null
      }
    }
    for (const ev of p.conferidos || []) { const r = pega(ev); if (r) r.conferido = true }
    for (const c of p.confirmacoes || []) {
      const r = pega(c.evento_id)
      if (r) { r.conferido = true; r.conferido_em = c.data_hora || null; r.conferido_por = c.usuario || null }
    }
    for (const ev of p.retirada_abada || []) { const r = pega(ev); if (r) r.abada = true }
    // histórico de expiração sem nada no cadastro -> registra como cancelada
    for (const h of D.HistoricoCancelamento || []) {
      if (h.pessoa_id === p.id && !m.has(h.evento_id) && idsEventos.has(h.evento_id)) {
        const r = pega(h.evento_id)
        r.motivo_cancelamento = h.motivo || 'expired_cancelled_event'
        r.cancelado_em = h.data_alteracao || null
      }
    }
    inscricoes.push(...m.values())
  }

  const historico = (D.HistoricoCancelamento || []).map((h) => ({
    id: h.id, evento_id: h.evento_id, evento_nome: h.evento_nome, pessoa_id: h.pessoa_id, pessoa_nome: h.pessoa_nome,
    status_anterior: h.status_anterior, novo_status: h.novo_status, data_alteracao: h.data_alteracao || ts(h.created_date),
    origem: h.origem, motivo: h.motivo,
  }))

  const usuarios = (D.User || []).filter((u) => u.email && !u.is_service).map((u) => ({
    email: u.email.trim().toLowerCase(), nome: u.full_name || '', role: ['admin', 'user', 'leitor'].includes(u.role) ? u.role : 'user',
    acesso_conferidos: u.acesso_conferidos !== false, acesso_abada: u.acesso_abada !== false, ativo: !u.disabled,
  }))

  return { eventos, pessoas, inscricoes, historico, usuarios, ignoradas }
}

// ---------------------------------------------------------------------
const T = transformar(D)
anotar(`Backup: ${T.eventos.length} eventos, ${T.pessoas.length} pessoas, ${T.inscricoes.length} inscrições, ${T.historico.length} históricos, ${T.usuarios.length} usuários`)
anotar(`  inscrições ativas: ${T.inscricoes.filter((i) => i.status === 'ativa').length} | conferidas: ${T.inscricoes.filter((i) => i.conferido).length} | com horário: ${T.inscricoes.filter((i) => i.conferido_em).length} | abadás: ${T.inscricoes.filter((i) => i.abada).length}`)
anotar(`  fotos a copiar: ${T.pessoas.filter((p) => p._foto_url).length} | documentos: ${T.pessoas.reduce((n, p) => n + p._documentos.length, 0)} | imagens de evento: ${T.eventos.filter((e) => e.imagem_url).length}`)
if (T.ignoradas.length) anotar(`  ${T.ignoradas.length} vínculo(s) com evento inexistente ignorado(s)`)

if (SIMULAR) {
  anotar('\nSimulação concluída — nada foi gravado.')
  process.exit(0)
}

const { createClient } = await import('@supabase/supabase-js')
const URL_ = process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENHA = process.env.SENHA_PROVISORIA
if (!URL_ || !SERVICE) { console.error('Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1) }
if (!SEM_USUARIOS && (!SENHA || SENHA.length < 6)) { console.error('Defina SENHA_PROVISORIA (mín. 6 caracteres) no .env, ou use --sem-usuarios'); process.exit(1) }
const sb = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const extDe = (tipo, url) => {
  if (tipo?.includes('png')) return 'png'
  if (tipo?.includes('webp')) return 'webp'
  if (tipo?.includes('pdf')) return 'pdf'
  if (tipo?.includes('jpeg') || tipo?.includes('jpg')) return 'jpg'
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(url || '')
  return m ? m[1].toLowerCase() : 'bin'
}

async function copiar(url, bucket, base) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const tipo = r.headers.get('content-type') || 'application/octet-stream'
      const buf = Buffer.from(await r.arrayBuffer())
      const caminho = `${base}.${extDe(tipo, url)}`
      const { error } = await sb.storage.from(bucket).upload(caminho, buf, { contentType: tipo, upsert: true })
      if (error) throw error
      return caminho
    } catch (e) {
      if (tentativa === 3) throw e
      await new Promise((r) => setTimeout(r, 800 * tentativa))
    }
  }
}

async function emLotes(itens, n, fn) {
  for (let i = 0; i < itens.length; i += n) {
    await Promise.all(itens.slice(i, i + n).map(fn))
    process.stdout.write(`\r  ${Math.min(i + n, itens.length)}/${itens.length}`)
  }
  if (itens.length) process.stdout.write('\n')
}

async function upsert(tabela, linhas, opcoes = {}) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await sb.from(tabela).upsert(linhas.slice(i, i + 500), opcoes)
    if (error) throw new Error(`${tabela}: ${error.message}`)
  }
}

// ---------- 1. Eventos ----------
anotar('\n[1/5] Eventos')
if (!SEM_ARQUIVOS) {
  await emLotes(T.eventos.filter((e) => e.imagem_url?.includes('base44')), 6, async (e) => {
    try {
      const caminho = await copiar(e.imagem_url, 'eventos', e.id)
      e.imagem_url = sb.storage.from('eventos').getPublicUrl(caminho).data.publicUrl
    } catch (err) { anotar(`  ! imagem do evento "${e.nome}" não copiada (${err.message})`) }
  })
}
await upsert('eventos', T.eventos)
anotar(`  ${T.eventos.length} eventos gravados`)

// ---------- 2. Pessoas + fotos + documentos ----------
anotar('\n[2/5] Pessoas, fotos e documentos')
const semFoto = []
const falhasFoto = []
if (!SEM_ARQUIVOS) {
  await emLotes(T.pessoas, 6, async (p) => {
    if (p._foto_url) {
      try { p.foto_path = await copiar(p._foto_url, 'fotos', `${p.id}/importada`) }
      catch (err) { falhasFoto.push(`${p.nome} (${p.cpf}) — ${err.message}`) }
    }
    for (const [n, d] of p._documentos.entries()) {
      try {
        const nome = (d.nome || `documento_${n + 1}`).replace(/[^\w.-]+/g, '_')
        const c = await copiar(d.url, 'documentos', `${p.id}/${n + 1}_${nome.replace(/\.[^.]+$/, '')}`)
        p.documentos.push({ nome: d.nome || nome, path: c })
      } catch (err) { anotar(`  ! documento de ${p.nome} não copiado (${err.message})`) }
    }
  })
}
for (const p of T.pessoas) if (!p.foto_path) semFoto.push(`${p.nome} (${p.cpf})`)
await upsert('pessoas', T.pessoas.map(({ _foto_url, _documentos, ...p }) => p))
anotar(`  ${T.pessoas.length} pessoas gravadas · ${T.pessoas.length - semFoto.length} com foto · ${semFoto.length} sem foto`)
if (falhasFoto.length) anotar(`  ! ${falhasFoto.length} foto(s) não copiadas (lista no log)`)

// ---------- 3. Inscrições ----------
anotar('\n[3/5] Inscrições')
await upsert('inscricoes', T.inscricoes, { onConflict: 'pessoa_id,evento_id' })
anotar(`  ${T.inscricoes.length} inscrições gravadas`)

// ---------- 4. Histórico ----------
anotar('\n[4/5] Histórico de cancelamentos')
await upsert('historico_cancelamento', T.historico)
anotar(`  ${T.historico.length} registros`)

// ---------- 5. Usuários ----------
anotar('\n[5/5] Usuários')
if (SEM_USUARIOS) anotar('  pulado (--sem-usuarios)')
else {
  const existentes = new Map()
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    data.users.forEach((u) => existentes.set(u.email?.toLowerCase(), u.id))
    if (data.users.length < 1000) break
  }
  for (const u of T.usuarios) {
    let id = existentes.get(u.email)
    let criado = false
    if (!id) {
      const { data, error } = await sb.auth.admin.createUser({ email: u.email, password: SENHA, email_confirm: true })
      if (error) { anotar(`  ! ${u.email}: ${error.message}`); continue }
      id = data.user.id
      criado = true
    }
    const perfil = { id, email: u.email, nome: u.nome, role: u.role, acesso_conferidos: u.acesso_conferidos, acesso_abada: u.acesso_abada, ativo: u.ativo }
    if (criado) perfil.trocar_senha = true
    const { error } = await sb.from('profiles').upsert(perfil)
    if (error) anotar(`  ! perfil ${u.email}: ${error.message}`)
    else anotar(`  ${criado ? '+ criado ' : '= já existia'} ${u.email} (${u.role})`)
  }
}

// ---------- Log ----------
log.push('\n--- Pessoas sem foto ---', ...semFoto)
if (falhasFoto.length) log.push('\n--- Fotos que falharam ---', ...falhasFoto)
if (T.ignoradas.length) log.push('\n--- Vínculos ignorados ---', ...T.ignoradas)
const arqLog = `importacao-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
fs.writeFileSync(arqLog, log.join('\n'), 'utf8')
anotar(`\nImportação concluída. Log salvo em ${arqLog}`)
