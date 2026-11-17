import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, buscarTudo } from './supabase'
import { hojeSP } from './utils'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

// Motivos de cancelamento que ainda contam como "cadastrado" nos relatórios
// (só a remoção manual tira a pessoa da lista do evento)
export const contaNoEvento = (i) => i.status === 'ativa' || (i.motivo_cancelamento && i.motivo_cancelamento !== 'manual')

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [eventos, setEventos] = useState([])
  const [pessoas, setPessoas] = useState([])
  const [inscricoes, setInscricoes] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [toast, setToast] = useState(null)
  const [recuperacao, setRecuperacao] = useState(false)
  const toastTimer = useRef(null)

  const avisar = useCallback((msg, tipo = 'ok') => {
    setToast({ msg, tipo })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ---------- Sessão ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      setSession(s)
      if (ev === 'PASSWORD_RECOVERY') setRecuperacao(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const carregarPerfil = useCallback(async () => {
    if (!session) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    setProfile(data || { semPerfil: true })
  }, [session])
  useEffect(() => { carregarPerfil() }, [carregarPerfil])

  // ---------- Dados ----------
  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [ev, pe, ins] = await Promise.all([
        buscarTudo('eventos', '*', 'created_at'),
        buscarTudo('pessoas', '*', 'nome'),
        buscarTudo('inscricoes', '*', 'id'),
      ])
      setEventos(ev.reverse())
      setPessoas(pe)
      setInscricoes(ins)
    } catch (e) {
      avisar('Erro ao carregar dados: ' + e.message, 'erro')
    } finally {
      setCarregando(false)
    }
  }, [avisar])

  useEffect(() => {
    if (!profile || profile.semPerfil || !profile.ativo) return
    // limpeza de inscrições expiradas (equivalente ao cancelarInscricoesExpiradas do sistema antigo)
    supabase.rpc('cancelar_inscricoes_expiradas').then(() => recarregar())

    // tempo real: conferências/retiradas feitas em outros aparelhos
    const canal = supabase
      .channel('inscricoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscricoes' }, (p) => {
        setInscricoes((atual) => {
          if (p.eventType === 'DELETE') return atual.filter((i) => i.id !== p.old.id)
          const idx = atual.findIndex((i) => i.id === p.new.id)
          if (idx === -1) return [...atual, p.new]
          const copia = atual.slice()
          copia[idx] = p.new
          return copia
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [profile, recarregar])

  const aplicarInscricao = (r) =>
    setInscricoes((atual) => {
      const idx = atual.findIndex((i) => i.id === r.id)
      if (idx === -1) return [...atual, r]
      const c = atual.slice()
      c[idx] = r
      return c
    })

  // ---------- Índices ----------
  const eventoPorId = useMemo(() => Object.fromEntries(eventos.map((e) => [e.id, e])), [eventos])
  const pessoaPorId = useMemo(() => Object.fromEntries(pessoas.map((p) => [p.id, p])), [pessoas])
  const inscPorPessoa = useMemo(() => {
    const m = {}
    for (const i of inscricoes) (m[i.pessoa_id] ||= []).push(i)
    return m
  }, [inscricoes])
  const inscPorEvento = useMemo(() => {
    const m = {}
    for (const i of inscricoes) (m[i.evento_id] ||= []).push(i)
    return m
  }, [inscricoes])

  // eventos em que a pessoa está inscrita (ativos)
  const eventosAtivosDaPessoa = useCallback(
    (pid) => (inscPorPessoa[pid] || []).filter((i) => i.status === 'ativa').map((i) => i.evento_id),
    [inscPorPessoa]
  )

  const eventosDisponiveis = useMemo(() => {
    const hoje = hojeSP()
    return eventos.filter((e) => e.ativo && (!e.data || e.data >= hoje))
  }, [eventos])

  // ---------- Ações ----------
  async function salvarPessoa(dados, eventosSelecionados, existente) {
    const { id, ...campos } = dados
    let pessoa
    if (existente) {
      const { data, error } = await supabase.from('pessoas').update(campos).eq('id', id).select().single()
      if (error) throw error
      pessoa = data
    } else {
      const { data, error } = await supabase.from('pessoas').insert({ id, ...campos }).select().single()
      if (error) throw error
      pessoa = data
    }

    const atuais = inscPorPessoa[pessoa.id] || []
    const novos = []
    // inscrever / reativar
    for (const evId of eventosSelecionados) {
      const ex = atuais.find((i) => i.evento_id === evId)
      if (!ex) novos.push({ pessoa_id: pessoa.id, evento_id: evId, status: 'ativa' })
      else if (ex.status !== 'ativa') {
        const { data, error } = await supabase.from('inscricoes')
          .update({ status: 'ativa', motivo_cancelamento: null, cancelado_em: null }).eq('id', ex.id).select().single()
        if (error) throw error
        aplicarInscricao(data)
      }
    }
    if (novos.length) {
      const { data, error } = await supabase.from('inscricoes').insert(novos).select()
      if (error) throw error
      data.forEach(aplicarInscricao)
    }
    // desmarcar
    for (const ex of atuais.filter((i) => i.status === 'ativa' && !eventosSelecionados.includes(i.evento_id))) {
      const { data, error } = await supabase.from('inscricoes')
        .update({ status: 'cancelada', motivo_cancelamento: 'manual', cancelado_em: new Date().toISOString() })
        .eq('id', ex.id).select().single()
      if (error) throw error
      aplicarInscricao(data)
      await supabase.from('historico_cancelamento').insert({
        evento_id: ex.evento_id, evento_nome: eventoPorId[ex.evento_id]?.nome, pessoa_id: pessoa.id,
        pessoa_nome: pessoa.nome, status_anterior: 'inscrito', novo_status: 'desmarcado', origem: 'manual', motivo: 'manual',
      })
    }

    setPessoas((ps) => {
      const outros = ps.filter((p) => p.id !== pessoa.id)
      return [...outros, pessoa].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    })
    return pessoa
  }

  async function excluirPessoa(p) {
    const { error } = await supabase.from('pessoas').delete().eq('id', p.id)
    if (error) throw error
    if (p.foto_path) await supabase.storage.from('fotos').remove([p.foto_path])
    const docs = (p.documentos || []).map((d) => d.path).filter(Boolean)
    if (docs.length) await supabase.storage.from('documentos').remove(docs)
    setPessoas((ps) => ps.filter((x) => x.id !== p.id))
    setInscricoes((is) => is.filter((i) => i.pessoa_id !== p.id))
  }

  async function marcar(tipo, pessoaId, eventoId, valor) {
    const fn = tipo === 'abada' ? 'marcar_abada' : 'marcar_conferido'
    const { data, error } = await supabase.rpc(fn, { p_pessoa: pessoaId, p_evento: eventoId, p_valor: valor })
    if (error) throw error
    aplicarInscricao(data)
    return data
  }

  async function salvarEvento(dados) {
    const { id, ...campos } = dados
    const q = id
      ? supabase.from('eventos').update(campos).eq('id', id).select().single()
      : supabase.from('eventos').insert(campos).select().single()
    const { data, error } = await q
    if (error) throw error
    setEventos((es) => (id ? es.map((e) => (e.id === id ? data : e)) : [data, ...es]))
    if (id && campos.ativo === false) await recarregar() // trigger cancela as inscrições
    return data
  }

  async function excluirEvento(id) {
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (error) throw error
    setEventos((es) => es.filter((e) => e.id !== id))
    setInscricoes((is) => is.filter((i) => i.evento_id !== id))
  }

  const role = profile?.role
  const valor = {
    session, profile, role, carregarPerfil,
    isAdmin: role === 'admin', isStaff: role === 'admin' || role === 'user', isLeitor: role === 'leitor',
    eventos, pessoas, inscricoes, carregando, recarregar,
    eventoPorId, pessoaPorId, inscPorPessoa, inscPorEvento, eventosAtivosDaPessoa, eventosDisponiveis,
    salvarPessoa, excluirPessoa, marcar, salvarEvento, excluirEvento,
    toast, avisar, recuperacao, setRecuperacao,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
