// Utilitários gerais
export const TZ = 'America/Sao_Paulo'

export const soDigitos = (s) => (s || '').replace(/\D/g, '')

export function mascaraCPF(v) {
  const d = soDigitos(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function cpfValido(v) {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const calc = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === +c[9] && calc(10) === +c[10]
}

// CPF mascarado para exibição em tela: ***.456.789-**
export const cpfOculto = (v) => {
  const c = mascaraCPF(v)
  return c.length === 14 ? `***.${c.slice(4, 11)}-**` : c
}

export const normalizar = (s) =>
  (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

// ---------- Datas (sempre exibidas no fuso de Brasília) ----------
const fmt = (opts) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opts })
const fDataHora = fmt({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fHora = fmt({ hour: '2-digit', minute: '2-digit' })

export const dataHora = (iso) => (iso ? fDataHora.format(new Date(iso)).replace(',', '') : '')
export const hora = (iso) => (iso ? fHora.format(new Date(iso)) : '')

// "2026-11-15" -> "15/11/2026" (data pura, sem fuso)
export const dataBR = (d) => (d ? d.split('-').reverse().join('/') : '')

// Minutos desde 00:00 no fuso de Brasília
export function minutosDoDia(iso) {
  const p = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const h = +p.find((x) => x.type === 'hour').value
  const m = +p.find((x) => x.type === 'minute').value
  return h * 60 + m
}
// Data (YYYY-MM-DD) no fuso de Brasília
export function diaSP(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(iso ? new Date(iso) : new Date())
}
export const hojeSP = () => diaSP()

export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// ---------- CSV (UTF-8 com BOM, separador ;) ----------
export function gerarCSV(cabecalho, linhas) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n')
}

export function baixarArquivo(conteudo, nome, tipo = 'text/csv;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const carimbo = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

export const nomeArquivo = (s) =>
  normalizar(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase() || 'SEM_NOME'

export const cx = (...c) => c.filter(Boolean).join(' ')

// ---------- Login por usuário (sem e-mail) ----------
// O Supabase exige e-mail; usuários sem e-mail ganham um e-mail interno neste domínio.
export const DOMINIO_LOGIN = 'pcd.efcsys.com'
export const normalizarUsuario = (u) => normalizar(u).replace(/[^a-z0-9._-]/g, '')
export const loginParaEmail = (login) => {
  const l = (login || '').trim().toLowerCase()
  return l.includes('@') ? l : `${normalizarUsuario(l)}@${DOMINIO_LOGIN}`
}
export const nomeDeLogin = (email) => (email || '').endsWith('@' + DOMINIO_LOGIN) ? email.split('@')[0] : email
