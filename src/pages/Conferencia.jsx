import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Shirt, Search, Check, Undo2 } from 'lucide-react'
import { useApp, contaNoEvento } from '../lib/store'
import { normalizar, soDigitos, dataBR, hojeSP, hora, cx } from '../lib/utils'
import { Badge, Botao, Card, Contador, Foto, Modal, Selecao, Titulo, Vazio, inputCls } from '../components/ui'

// Página única para "Conferidos" (check-in) e "Abadá" (retirada)
export default function Conferencia({ tipo }) {
  const { eventos, inscPorEvento, pessoaPorId, eventoPorId, inscPorPessoa, marcar, isLeitor, avisar } = useApp()
  const ehAbada = tipo === 'abada'
  const campo = ehAbada ? 'abada' : 'conferido'
  const campoEm = ehAbada ? 'abada_em' : 'conferido_em'
  const campoPor = ehAbada ? 'abada_por' : 'conferido_por'
  const hoje = hojeSP()

  // eventos com inscritos; ativos e de hoje/futuros primeiro
  const opcoes = useMemo(() => {
    const comInscritos = eventos.filter((e) => (inscPorEvento[e.id] || []).some(contaNoEvento))
    const peso = (e) => (e.ativo && (!e.data || e.data >= hoje) ? 0 : 1)
    return comInscritos.sort((a, b) => peso(a) - peso(b) || (peso(a) === 0
      ? (a.data || '9').localeCompare(b.data || '9')
      : (b.data || '').localeCompare(a.data || '')))
  }, [eventos, inscPorEvento, hoje])

  const [eventoId, setEventoId] = useState(() => opcoes.find((e) => e.data === hoje)?.id || opcoes[0]?.id || '')
  useEffect(() => {
    if (!eventoId && opcoes.length) setEventoId(opcoes.find((e) => e.data === hoje)?.id || opcoes[0].id)
  }, [opcoes, eventoId, hoje])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [ocupado, setOcupado] = useState(null)
  const [foto, setFoto] = useState(null)

  const lista = useMemo(() => {
    if (!eventoId) return []
    return (inscPorEvento[eventoId] || [])
      .filter(contaNoEvento)
      .map((i) => ({ i, p: pessoaPorId[i.pessoa_id] }))
      .filter((x) => x.p)
      .sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
  }, [eventoId, inscPorEvento, pessoaPorId])

  const visiveis = useMemo(() => {
    const t = normalizar(busca)
    const d = soDigitos(busca)
    return lista.filter(({ i, p }) => {
      if (filtro === 'pendentes' && i[campo]) return false
      if (filtro === 'feitos' && !i[campo]) return false
      if (!t) return true
      return normalizar(p.nome).includes(t) || (d && p.cpf_digitos?.includes(d))
    })
  }, [lista, busca, filtro, campo])

  const feitos = lista.filter((x) => x.i[campo]).length

  async function alternar(i, valor) {
    setOcupado(i.id)
    try {
      await marcar(tipo, i.pessoa_id, i.evento_id, valor)
      avisar(valor ? (ehAbada ? 'Abadá retirado' : 'Presença confirmada') : 'Desfeito')
    } catch (e) {
      avisar(e.message, 'erro')
    } finally {
      setOcupado(null)
    }
  }

  const Icone = ehAbada ? Shirt : ClipboardCheck
  return (
    <div>
      <Titulo icone={Icone}>{ehAbada ? 'Retirada de Abadá' : 'Conferidos'}</Titulo>
      <Card className="mb-4 space-y-3 p-4">
        <Selecao value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
          {opcoes.length === 0 && <option value="">Nenhum evento com inscritos</option>}
          {opcoes.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}{e.data ? ` — ${dataBR(e.data)}` : ''}{!e.ativo ? ' (inativo)' : ''}</option>
          ))}
        </Selecao>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className={inputCls + ' pl-9'} placeholder="Buscar por nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2 text-sm">
          {[['todos', 'Todos'], ['pendentes', 'Pendentes'], ['feitos', ehAbada ? 'Retirados' : 'Conferidos']].map(([k, r]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={cx('rounded-full px-3 py-1', filtro === k ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700')}>{r}</button>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Contador rotulo="Inscritos" valor={lista.length} />
        <Contador rotulo={ehAbada ? 'Retirados' : 'Conferidos'} valor={feitos} cor="text-green-600" />
        <Contador rotulo="Pendentes" valor={lista.length - feitos} cor="text-orange-600" />
      </div>

      <Card className="divide-y divide-gray-100 dark:divide-gray-700">
        {visiveis.length === 0 && <Vazio>Ninguém encontrado.</Vazio>}
        {visiveis.map(({ i, p }) => {
          const feito = i[campo]
          const outros = (inscPorPessoa[p.id] || []).filter((x) => x.evento_id !== eventoId && x.status === 'ativa')
          return (
            <div key={i.id} className={cx('flex items-center gap-3 p-3 sm:p-4', feito && 'bg-green-50/60 dark:bg-green-900/10')}>
              <Foto path={p.foto_path} nome={p.nome} className="h-14 w-14" onClick={p.foto_path ? () => setFoto(p) : undefined} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.nome}</div>
                <div className="text-xs text-gray-500">{p.cpf}{p.acompanhante ? ` · Acomp.: ${p.acompanhante}` : ''}</div>
                {feito && (
                  <div className="text-xs text-green-700 dark:text-green-400">
                    {i[campoEm] ? `${ehAbada ? 'Retirado' : 'Confirmado'} às ${hora(i[campoEm])}` : 'Sem horário registrado'}
                    {i[campoPor] ? ` por ${i[campoPor]}` : ''}
                  </div>
                )}
                {outros.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {outros.slice(0, 2).map((x) => <Badge key={x.id} cor="cinza" className="max-w-[160px] truncate">{eventoPorId[x.evento_id]?.nome}</Badge>)}
                    {outros.length > 2 && <Badge cor="cinza">+{outros.length - 2}</Badge>}
                  </div>
                )}
              </div>
              {feito ? (
                isLeitor ? (
                  <Badge cor="verde" className="!px-3 !py-2"><Check className="h-4 w-4" /> OK</Badge>
                ) : (
                  <Botao v="contorno" className="shrink-0" carregando={ocupado === i.id} onClick={() => alternar(i, false)}>
                    <Undo2 className="h-4 w-4" /> <span className="hidden sm:inline">Desfazer</span>
                  </Botao>
                )
              ) : (
                <Botao v={ehAbada ? 'laranja' : 'verde'} className="shrink-0 !py-3" carregando={ocupado === i.id} onClick={() => alternar(i, true)}>
                  <Check className="h-4 w-4" /> {ehAbada ? 'Retirar' : 'Conferir'}
                </Botao>
              )}
            </div>
          )
        })}
      </Card>

      <Modal aberto={!!foto} onFechar={() => setFoto(null)} titulo={foto?.nome} largura="max-w-lg">
        {foto && <Foto path={foto.foto_path} className="h-auto w-full !rounded-xl" />}
      </Modal>
    </div>
  )
}
