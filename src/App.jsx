import { useEffect, useMemo, useState } from 'react'
import {
  Users, UserPlus, CalendarDays, Calendar, ClipboardCheck, Shirt, BarChart3, Database, Printer, UserCog,
  LogOut, Sun, Moon, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useApp } from './lib/store'
import { supabase } from './lib/supabase'
import { cx, nomeDeLogin } from './lib/utils'
import { Botao, Card, Campo } from './components/ui'
import Login from './pages/Login'
import Lista from './pages/Lista'
import Novo from './pages/Novo'
import Calendario from './pages/Calendario'
import Eventos from './pages/Eventos'
import Conferencia from './pages/Conferencia'
import Relatorios from './pages/Relatorios'
import BancoDeDados from './pages/BancoDeDados'
import Impressao from './pages/Impressao'
import Usuarios from './pages/Usuarios'

const PaginaConferidos = () => <Conferencia tipo="conferido" />
const PaginaAbada = () => <Conferencia tipo="abada" />

const MENU = [
  { id: 'List', rotulo: 'Cadastros', icone: Users, pode: (a) => a.isStaff },
  { id: 'New', rotulo: 'Novo', icone: UserPlus, pode: (a) => a.isStaff },
  { id: 'Calendar', rotulo: 'Calendário', icone: CalendarDays, pode: (a) => a.isStaff },
  { id: 'Events', rotulo: 'Eventos', icone: Calendar, pode: (a) => a.isStaff },
  { id: 'Conferidos', rotulo: 'Conferidos', icone: ClipboardCheck, pode: (a) => a.isStaff || (a.isLeitor && a.profile.acesso_conferidos) },
  { id: 'RetiradaAbada', rotulo: 'Abadá', icone: Shirt, pode: (a) => a.isStaff || (a.isLeitor && a.profile.acesso_abada) },
  { id: 'Relatorios', rotulo: 'Relatórios', icone: BarChart3, pode: (a) => a.isStaff },
  { id: 'BancoDeDados', rotulo: 'Banco de Dados', icone: Database, pode: (a) => a.isAdmin },
  { id: 'Reports', rotulo: 'Impressão', icone: Printer, pode: (a) => a.isStaff },
  { id: 'Usuarios', rotulo: 'Usuários', icone: UserCog, pode: (a) => a.isStaff },
]

function useHash() {
  const ler = () => (window.location.hash || '').replace('#', '').split('?')[0]
  const [h, setH] = useState(ler)
  useEffect(() => {
    const f = () => setH(ler())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return h
}

function useTema() {
  const [escuro, setEscuro] = useState(() => {
    try { return localStorage.getItem('tema') === 'escuro' } catch { return false }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', escuro)
    try { localStorage.setItem('tema', escuro ? 'escuro' : 'claro') } catch { /* sem storage */ }
  }, [escuro])
  return [escuro, setEscuro]
}

function StatsBar() {
  const { pessoas, eventos, inscricoes } = useApp()
  const inscritos = new Set(inscricoes.filter((i) => i.status === 'ativa').map((i) => i.pessoa_id)).size
  const itens = [
    ['Cadastros', pessoas.length],
    ['Ativos', pessoas.filter((p) => p.status !== 'inativo').length],
    ['Inscritos', inscritos],
    ['Eventos', eventos.length],
    ['Eventos ativos', eventos.filter((e) => e.ativo).length],
  ]
  return (
    <div className="sticky top-0 z-30 border-b border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 py-2 text-xs">
        {itens.map(([r, v]) => (
          <span key={r} className="whitespace-nowrap text-gray-500 dark:text-gray-400">
            {r}: <b className="text-gray-900 dark:text-white">{v}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function TrocarSenha() {
  const { carregarPerfil, avisar, setRecuperacao } = useApp()
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [ok, setOk] = useState(false)
  async function salvar(e) {
    e.preventDefault()
    if (s1.length < 6) return avisar('A senha precisa ter pelo menos 6 caracteres', 'erro')
    if (s1 !== s2) return avisar('As senhas não conferem', 'erro')
    setOk(true)
    const { error } = await supabase.auth.updateUser({ password: s1 })
    if (error) { setOk(false); return avisar(error.message, 'erro') }
    await supabase.rpc('senha_alterada')
    await carregarPerfil()
    setRecuperacao(false)
    avisar('Senha alterada!')
  }
  return (
    <div className="grid min-h-screen place-items-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-sm p-6">
        <h2 className="mb-1 text-lg font-bold dark:text-white">Crie sua nova senha</h2>
        <p className="mb-4 text-sm text-gray-500">Você entrou com uma senha provisória.</p>
        <form onSubmit={salvar} className="space-y-3">
          <Campo label="Nova senha" type="password" value={s1} onChange={(e) => setS1(e.target.value)} autoComplete="new-password" />
          <Campo label="Repita a senha" type="password" value={s2} onChange={(e) => setS2(e.target.value)} autoComplete="new-password" />
          <Botao className="w-full" carregando={ok}>Salvar senha</Botao>
        </form>
      </Card>
    </div>
  )
}

function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  const erro = toast.tipo === 'erro'
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 px-4 w-full max-w-md no-print">
      <div className={cx('flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-2xl', erro ? 'bg-red-600' : 'bg-gray-900')}>
        {erro ? <AlertCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />}
        {toast.msg}
      </div>
    </div>
  )
}

export default function App() {
  const app = useApp()
  const { session, profile, recarregar, carregando } = app
  const hash = useHash()
  const [escuro, setEscuro] = useTema()

  const permitidos = useMemo(() => (profile && !profile.semPerfil ? MENU.filter((m) => m.pode(app)) : []), [profile, app])
  const atual = permitidos.find((m) => m.id === hash) || permitidos[0]

  useEffect(() => {
    if (atual && hash !== atual.id) window.location.replace('#' + atual.id)
    window.scrollTo(0, 0)
    document.querySelector('nav a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [atual, hash])

  if (session === undefined) return <div className="grid min-h-screen place-items-center text-gray-400">Carregando…</div>
  if (!session) return (<><Login /><Toast /></>)
  if (!profile) return <div className="grid min-h-screen place-items-center text-gray-400">Carregando perfil…</div>
  if (profile.semPerfil || !profile.ativo)
    return (
      <div className="grid min-h-screen place-items-center p-4 text-center">
        <div>
          <p className="mb-4 text-gray-600">Sua conta não tem acesso ao sistema. Fale com um administrador.</p>
          <Botao v="secundario" onClick={() => supabase.auth.signOut()}>Sair</Botao>
        </div>
      </div>
    )
  if (profile.trocar_senha || app.recuperacao) return (<><TrocarSenha /><Toast /></>)

  const Pagina = {
    List: Lista, New: Novo, Calendar: Calendario, Events: Eventos,
    Conferidos: PaginaConferidos, RetiradaAbada: PaginaAbada,
    Relatorios, BancoDeDados, Reports: Impressao, Usuarios,
  }[atual?.id]

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="no-print text-white shadow-lg" style={{ background: 'linear-gradient(90deg,#8338ec,#ff006e,#ffbe0b)' }}>
        <div className="mx-auto max-w-6xl px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium opacity-90 truncate">Olá, {profile.nome || nomeDeLogin(profile.email)}</span>
            <div className="flex items-center gap-1">
              <button title="Atualizar dados" onClick={recarregar} className="rounded-lg bg-white/10 p-2 hover:bg-white/20">
                <RefreshCw className={cx('h-4 w-4', carregando && 'animate-spin')} />
              </button>
              <button title="Tema" onClick={() => setEscuro(!escuro)} className="rounded-lg bg-white/10 p-2 hover:bg-white/20">
                {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          </div>
          <div className="my-3 flex flex-wrap items-center justify-center gap-3 sm:gap-8">
            <img src="./logos/augustus.png" alt="Augustus Produções" className="h-20 w-20 sm:h-[110px] sm:w-[110px] object-contain transition hover:scale-105 [filter:drop-shadow(0_0_1.5px_#fff)_drop-shadow(0_0_1.5px_#fff)_drop-shadow(0_0_2px_#fff)]" />
            <a href={'#' + (permitidos[0]?.id || '')}>
              <img src="./logos/point.png" alt="Point do Ingresso" className="h-24 w-24 sm:h-[140px] sm:w-[140px] object-contain transition hover:scale-105 [filter:drop-shadow(0_0_1.5px_#fff)_drop-shadow(0_0_1.5px_#fff)_drop-shadow(0_0_2px_#fff)]" />
            </a>
            <img src="./logos/precaju.png" alt="Pré-Caju" className="h-20 w-28 sm:h-[110px] sm:w-[150px] object-contain transition hover:scale-105 drop-shadow-md" />
          </div>
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
            {permitidos.map(({ id, rotulo, icone: I }) => (
              <a key={id} href={'#' + id} aria-current={atual?.id === id ? 'page' : undefined}
                className={cx('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition',
                  atual?.id === id ? 'bg-white/30 ring-2 ring-white font-semibold' : 'bg-white/10 hover:bg-white/20')}>
                <I className="h-4 w-4" /> {rotulo}
              </a>
            ))}
          </nav>
        </div>
      </header>
      {app.isStaff && <div className="no-print"><StatsBar /></div>}
      <main key={atual?.id} className="mx-auto max-w-6xl p-3 sm:p-6 animate-[entrar_.25s_ease-out]">
        {Pagina && <Pagina />}
      </main>
      <footer className="no-print pb-6 pt-2 text-center text-xs text-gray-400">by: efcsys</footer>
      <Toast />
    </div>
  )
}
