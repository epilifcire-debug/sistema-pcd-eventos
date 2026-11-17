import { useMemo, useState } from 'react'
import { BarChart3, Printer, Download, Search, Clock, TrendingUp, LogIn, LogOut as LogOutIcon, Users } from 'lucide-react'
import { useApp, contaNoEvento } from '../lib/store'
import { calcularPicos, calcularComparativo } from '../lib/relatorios'
import {
  normalizar, soDigitos, dataBR, dataHora, hora, cpfOculto, gerarCSV, baixarArquivo, carimbo, nomeArquivo, hojeSP, cx,
} from '../lib/utils'
import { Badge, Botao, Card, Foto, Selecao, Titulo, Vazio, inputCls } from '../components/ui'

function useEventosOrdenados() {
  const { eventos, inscPorEvento } = useApp()
  return useMemo(() => {
    const hoje = hojeSP()
    return eventos
      .filter((e) => (inscPorEvento[e.id] || []).some((i) => contaNoEvento(i) || i.conferido))
      .sort((a, b) => {
        const fa = a.data && a.data <= hoje ? 0 : 1
        const fb = b.data && b.data <= hoje ? 0 : 1
        return fa - fb || (b.data || '').localeCompare(a.data || '')
      })
  }, [eventos, inscPorEvento])
}

function SeletorEvento({ value, onChange }) {
  const lista = useEventosOrdenados()
  return (
    <Selecao value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione o evento…</option>
      {lista.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.data ? ` — ${dataBR(e.data)}` : ''}</option>)}
    </Selecao>
  )
}

// ---------------------------------------------------------------- Conferidos / Abadá
function Presenca({ tipo }) {
  const { inscPorEvento, pessoaPorId, eventoPorId } = useApp()
  const [ev, setEv] = useState('')
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const ehAbada = tipo === 'abada'
  const c = ehAbada ? 'abada' : 'conferido'
  const cEm = ehAbada ? 'abada_em' : 'conferido_em'
  const cPor = ehAbada ? 'abada_por' : 'conferido_por'

  const linhas = useMemo(() => {
    if (!ev) return []
    const t = normalizar(busca); const d = soDigitos(busca)
    return (inscPorEvento[ev] || [])
      .filter((i) => contaNoEvento(i) || i[c])
      .map((i) => ({ i, p: pessoaPorId[i.pessoa_id] }))
      .filter(({ i, p }) => p && (status === 'todos' || (status === 'sim' ? i[c] : !i[c])) &&
        (!t || normalizar(p.nome).includes(t) || (d && p.cpf_digitos?.includes(d))))
      .sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
  }, [ev, busca, status, inscPorEvento, pessoaPorId, c])

  const e = eventoPorId[ev]
  function csv() {
    const st = (i) => (i[c] ? (ehAbada ? 'Retirado' : 'Conferido') : 'Pendente')
    const conteudo = gerarCSV(
      ['Nome', 'CPF', 'Evento', 'Data do evento', 'Status', `Data/Hora da ${ehAbada ? 'retirada' : 'confirmação'}`, ehAbada ? 'Retirado por' : 'Confirmado por'],
      linhas.map(({ i, p }) => [p.nome.trim(), p.cpf, e?.nome, dataBR(e?.data), st(i), i[c] ? (i[cEm] ? dataHora(i[cEm]) : 'Sem horário registrado') : '', i[cPor] || ''])
    )
    baixarArquivo(conteudo, `${ehAbada ? 'abada' : 'conferidos'}_${nomeArquivo(e?.nome)}_${carimbo()}.csv`)
  }

  const feitos = linhas.filter((x) => x.i[c]).length
  return (
    <div>
      <Card className="no-print mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_160px]">
        <SeletorEvento value={ev} onChange={setEv} />
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className={inputCls + ' pl-9'} placeholder="Nome ou CPF" value={busca} onChange={(x) => setBusca(x.target.value)} />
        </div>
        <Selecao value={status} onChange={(x) => setStatus(x.target.value)}>
          <option value="todos">Todos</option>
          <option value="sim">{ehAbada ? 'Retirados' : 'Conferidos'}</option>
          <option value="nao">Pendentes</option>
        </Selecao>
      </Card>
      {!ev ? <Card><Vazio>Selecione um evento.</Vazio></Card> : (
        <>
          <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-gray-500">{feitos} de {linhas.length} {ehAbada ? 'retiraram' : 'conferidos'}</span>
            <div className="flex gap-2">
              <Botao v="contorno" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Botao>
              <Botao v="contorno" onClick={csv}><Download className="h-4 w-4" /> CSV</Botao>
            </div>
          </div>
          <div className="so-print mb-4">
            <h2 className="text-lg font-bold">{ehAbada ? 'Retirada de Abadá' : 'Conferidos'} — {e?.nome} {e?.data && `(${dataBR(e.data)})`}</h2>
            <p className="text-xs">{feitos} de {linhas.length} · gerado em {dataHora(new Date().toISOString())}</p>
          </div>
          <Card className="divide-y divide-gray-100 dark:divide-gray-700">
            {linhas.length === 0 && <Vazio>Nada encontrado.</Vazio>}
            {linhas.map(({ i, p }) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-2">
                <Foto path={p.foto_path} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.nome}</div>
                  <div className="text-xs text-gray-500">{cpfOculto(p.cpf)}</div>
                </div>
                <div className="text-right text-xs">
                  {i[c] ? (
                    <>
                      <Badge cor="verde">{ehAbada ? 'Retirado' : 'Conferido'}</Badge>
                      <div className="mt-0.5 text-gray-500">
                        {i[cEm] ? `${dataHora(i[cEm])}` : 'Sem horário registrado'}{i[cPor] ? ` · ${i[cPor]}` : ''}
                      </div>
                    </>
                  ) : <Badge cor="laranja">Pendente</Badge>}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Picos
function TabelaPicos({ dados, compacta }) {
  if (!dados.faixas.length) return <Vazio>Sem confirmações com horário registrado.</Vazio>
  const max = Math.max(...dados.faixas.map((f) => f.qtd))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="py-2 pr-2">Faixa</th><th className="px-2 text-right">Confirm.</th>
            {!compacta && <th className="px-2 text-right">% do dia</th>}
            <th className="px-2 text-right">Acum.</th>
            {!compacta && <th className="w-1/3 pl-2"></th>}
          </tr>
        </thead>
        <tbody>
          {dados.faixas.map((f) => {
            const pos = dados.top.indexOf(f.inicio)
            return (
              <tr key={f.inicio} className={cx('border-t border-gray-100 dark:border-gray-700',
                pos === 0 && 'bg-purple-100 font-semibold dark:bg-purple-900/40', pos > 0 && 'bg-purple-50 dark:bg-purple-900/20')}>
                <td className="whitespace-nowrap py-1.5 pr-2">{f.rotulo}</td>
                <td className="px-2 text-right">{f.qtd}</td>
                {!compacta && <td className="px-2 text-right">{f.pct.toFixed(1)}%</td>}
                <td className="px-2 text-right">{f.acumulado}</td>
                {!compacta && (
                  <td className="pl-2">
                    <div className="h-3 rounded bg-gradient-to-r from-purple-600 to-pink-500" style={{ width: `${max ? (f.qtd / max) * 100 : 0}%` }} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Grafico({ dados }) {
  if (!dados.faixas.length) return null
  const max = Math.max(...dados.faixas.map((f) => f.qtd))
  return (
    <div className="flex h-40 items-end gap-0.5 overflow-x-auto pb-6 pt-2">
      {dados.faixas.map((f, n) => (
        <div key={f.inicio} className="group relative flex h-full min-w-[14px] flex-1 flex-col justify-end" title={`${f.rotulo}: ${f.qtd}`}>
          <span className="mb-0.5 text-center text-[10px] text-gray-500">{f.qtd || ''}</span>
          <div className={cx('rounded-t', dados.top.includes(f.inicio) ? 'bg-pink-500' : 'bg-purple-500/70')}
            style={{ height: `${max ? (f.qtd / max) * 85 : 0}%` }} />
          {n % Math.max(1, Math.ceil(dados.faixas.length / 10)) === 0 && (
            <span className="absolute -bottom-5 left-0 whitespace-nowrap text-[10px] text-gray-400">{f.rotulo.slice(0, 5)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function Picos() {
  const { inscPorEvento, eventoPorId } = useApp()
  const [ev, setEv] = useState('')
  const [intervalo, setIntervalo] = useState(30)
  const dados = useMemo(() => calcularPicos(inscPorEvento[ev] || [], intervalo), [ev, intervalo, inscPorEvento])

  function csv() {
    const e = eventoPorId[ev]
    baixarArquivo(gerarCSV(['Faixa de horário', 'Confirmações', '% do total do dia', 'Acumulado'],
      dados.faixas.map((f) => [f.rotulo, f.qtd, f.pct.toFixed(1).replace('.', ','), f.acumulado])),
    `picos_${nomeArquivo(e?.nome)}_${intervalo}min_${carimbo()}.csv`)
  }

  return (
    <div>
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_200px]">
        <SeletorEvento value={ev} onChange={setEv} />
        <Selecao value={intervalo} onChange={(e) => setIntervalo(+e.target.value)}>
          <option value={15}>Faixas de 15 min</option>
          <option value={30}>Faixas de 30 min</option>
          <option value={60}>Faixas de 1 hora</option>
        </Selecao>
      </Card>
      {!ev ? <Card><Vazio>Selecione um evento.</Vazio></Card> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Users className="h-4 w-4" />Total confirmado</div><div className="text-2xl font-bold text-purple-600">{dados.total}</div></Card>
            <Card className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><TrendingUp className="h-4 w-4" />Horário de pico</div><div className="text-lg font-bold text-pink-600">{dados.pico ? dados.pico.rotulo : '—'}</div>{dados.pico && <div className="text-xs text-gray-500">{dados.pico.qtd} confirmações</div>}</Card>
            <Card className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><LogIn className="h-4 w-4" />Primeira</div><div className="text-2xl font-bold text-green-600">{dados.primeira ? hora(dados.primeira) : '—'}</div></Card>
            <Card className="p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><LogOutIcon className="h-4 w-4" />Última</div><div className="text-2xl font-bold text-orange-600">{dados.ultima ? hora(dados.ultima) : '—'}</div></Card>
          </div>
          {dados.semHorario > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <Clock className="mr-1 inline h-3 w-3" />{dados.semHorario} conferido(s) sem horário registrado (conferências antigas) — não entram na tabela de picos.
            </p>
          )}
          <Card className="mb-4 p-4"><Grafico dados={dados} /></Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Picos de acesso</span>
              <Botao v="contorno" onClick={csv} disabled={!dados.faixas.length}><Download className="h-4 w-4" /> CSV</Botao>
            </div>
            <TabelaPicos dados={dados} />
          </Card>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Comparativo
function Comparativo() {
  const { inscPorEvento, pessoaPorId, eventoPorId } = useApp()
  const lista = useEventosOrdenados()
  const [sel, setSel] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [intervalo, setIntervalo] = useState(30)

  // ordena os dias selecionados por data
  const ids = useMemo(() => [...sel].sort((a, b) => (eventoPorId[a]?.data || '').localeCompare(eventoPorId[b]?.data || '')), [sel, eventoPorId])
  const { linhas, resumo } = useMemo(() => calcularComparativo(ids, inscPorEvento, pessoaPorId), [ids, inscPorEvento, pessoaPorId])
  const picos = useMemo(() => Object.fromEntries(ids.map((id) => [id, calcularPicos(inscPorEvento[id] || [], intervalo)])), [ids, inscPorEvento, intervalo])

  const visiveis = useMemo(() => {
    const t = normalizar(busca); const d = soDigitos(busca)
    return linhas.filter((l) => {
      if (filtro === 'todos_dias' && l.total !== ids.length) return false
      if (filtro === 'um_dia' && l.total !== 1) return false
      if (filtro === 'nenhum' && l.total !== 0) return false
      return !t || normalizar(l.nome).includes(t) || (d && soDigitos(l.cpf).includes(d))
    })
  }, [linhas, filtro, busca, ids.length])

  const celula = (d) => (!d ? '—' : d.presente ? `✔ ${d.em ? hora(d.em) : 's/ horário'}` : 'Cadastrado – não compareceu')
  const nomeDia = (id) => { const e = eventoPorId[id]; return e ? `${e.nome}${e.data ? ` (${dataBR(e.data)})` : ''}` : id }

  function csv() {
    const conteudo = gerarCSV(
      ['Nome', 'CPF', ...ids.map(nomeDia), 'Total de dias presentes'],
      visiveis.map((l) => [l.nome, l.cpf, ...ids.map((id) => celula(l.dias[id]).replace('✔', 'Presente')), l.total])
    )
    baixarArquivo(conteudo, `comparativo_${carimbo()}.csv`)
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="mb-2 text-sm font-medium">Selecione os dias/eventos para comparar</div>
        <div className="flex flex-wrap gap-2">
          {lista.map((e) => {
            const on = sel.includes(e.id)
            return (
              <button key={e.id} onClick={() => setSel((s) => (on ? s.filter((x) => x !== e.id) : [...s, e.id]))}
                className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 dark:border-gray-600')}>
                {e.nome}{e.data ? ` · ${dataBR(e.data)}` : ''}
              </button>
            )
          })}
        </div>
      </Card>

      {ids.length < 2 ? <Card><Vazio>Selecione pelo menos 2 dias para comparar (ex.: Camarote Aju sexta, sábado e domingo).</Vazio></Card> : (
        <>
          <Card className="mb-4 overflow-x-auto p-4">
            <div className="mb-2 font-semibold">Resumo por dia</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500">
                <th className="py-2">Dia</th><th className="text-right">Cadastrados</th><th className="text-right">Confirmados</th><th className="text-right">Taxa</th><th className="pl-3">Pico</th>
              </tr></thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.eventoId} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-2">{nomeDia(r.eventoId)}</td>
                    <td className="text-right">{r.cadastrados}</td>
                    <td className="text-right text-green-600">{r.confirmados}</td>
                    <td className="text-right font-semibold">{r.taxa.toFixed(1)}%</td>
                    <td className="whitespace-nowrap pl-3">{picos[r.eventoId]?.pico?.rotulo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input className={inputCls + ' pl-9'} placeholder="Buscar nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {[['todos', 'Todos'], ['todos_dias', 'Presentes em todos os dias'], ['um_dia', 'Presentes em apenas 1 dia'], ['nenhum', 'Não compareceram']].map(([k, r]) => (
                <button key={k} onClick={() => setFiltro(k)} className={cx('rounded-full px-3 py-1', filtro === k ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700')}>{r}</button>
              ))}
            </div>
          </Card>

          <Card className="mb-4 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{visiveis.length} pessoas</span>
              <Botao v="contorno" onClick={csv}><Download className="h-4 w-4" /> CSV</Botao>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="tabela-fixa w-full text-sm">
                <thead className="sticky top-0 z-[2] bg-white dark:bg-gray-800">
                  <tr className="text-left text-xs text-gray-500">
                    <th className="bg-white py-2 pr-3 dark:bg-gray-800">Nome</th>
                    <th className="px-2">CPF</th>
                    {ids.map((id) => <th key={id} className="min-w-[130px] px-2">{nomeDia(id)}</th>)}
                    <th className="px-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <tr key={l.chave} className="border-t border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                      <td className="max-w-[180px] truncate py-2 pr-3 font-medium">{l.nome}</td>
                      <td className="whitespace-nowrap px-2 text-xs text-gray-500">{cpfOculto(l.cpf)}</td>
                      {ids.map((id) => {
                        const d = l.dias[id]
                        return (
                          <td key={id} className={cx('px-2 text-xs', d?.presente ? 'font-medium text-green-600' : d ? 'text-orange-600' : 'text-gray-400')}>
                            {celula(d)}
                          </td>
                        )
                      })}
                      <td className="px-2 text-right font-semibold">{l.total}/{ids.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Picos por dia</span>
            <Selecao className="!w-44" value={intervalo} onChange={(e) => setIntervalo(+e.target.value)}>
              <option value={15}>15 min</option><option value={30}>30 min</option><option value={60}>1 hora</option>
            </Selecao>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ids.map((id) => (
              <Card key={id} className="p-4">
                <div className="mb-1 text-sm font-semibold">{nomeDia(id)}</div>
                <div className="mb-2 text-xs text-gray-500">Pico: {picos[id].pico?.rotulo || '—'} · {picos[id].total} confirmados</div>
                <TabelaPicos dados={picos[id]} compacta />
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Cadastrados por evento
function PorEvento() {
  const { eventos, inscPorEvento } = useApp()
  const linhas = eventos.map((e) => {
    const ins = (inscPorEvento[e.id] || []).filter((i) => contaNoEvento(i) || i.conferido)
    const conf = ins.filter((i) => i.conferido).length
    return { e, total: ins.length, conf, abada: ins.filter((i) => i.abada).length, taxa: ins.length ? (conf / ins.length) * 100 : 0 }
  }).sort((a, b) => (b.e.data || '').localeCompare(a.e.data || ''))

  function csv() {
    baixarArquivo(gerarCSV(['Evento', 'Data', 'Ativo', 'Cadastrados', 'Conferidos', 'Abadás', 'Taxa de comparecimento (%)'],
      linhas.map((l) => [l.e.nome, dataBR(l.e.data), l.e.ativo ? 'Sim' : 'Não', l.total, l.conf, l.abada, l.taxa.toFixed(1).replace('.', ',')])),
    `cadastrados_por_evento_${carimbo()}.csv`)
  }

  return (
    <Card className="overflow-x-auto p-4">
      <div className="mb-2 flex justify-end"><Botao v="contorno" onClick={csv}><Download className="h-4 w-4" /> CSV</Botao></div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500">
          <th className="py-2">Evento</th><th>Data</th><th className="text-right">Cadastrados</th><th className="text-right">Conferidos</th><th className="text-right">Abadás</th><th className="text-right">Taxa</th>
        </tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.e.id} className="border-t border-gray-100 dark:border-gray-700">
              <td className="py-2 pr-2">{l.e.nome} {!l.e.ativo && <Badge cor="cinza">inativo</Badge>}</td>
              <td className="whitespace-nowrap">{dataBR(l.e.data)}</td>
              <td className="text-right">{l.total}</td>
              <td className="text-right text-green-600">{l.conf}</td>
              <td className="text-right text-orange-600">{l.abada}</td>
              <td className="text-right font-semibold">{l.taxa.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export default function Relatorios() {
  const { isAdmin } = useApp()
  const abas = [
    ['conf', 'Conferidos'], ['abada', 'Abadá'], ['picos', 'Picos de acesso'], ['comp', 'Comparativo'],
    ...(isAdmin ? [['evento', 'Cadastrados por Evento']] : []),
  ]
  const [aba, setAba] = useState('conf')
  return (
    <div>
      <div className="no-print"><Titulo icone={BarChart3}>Relatórios</Titulo></div>
      <div className="no-print mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow dark:bg-gray-800">
        {abas.map(([k, r]) => (
          <button key={k} onClick={() => setAba(k)}
            className={cx('whitespace-nowrap rounded-lg px-4 py-2 text-sm transition', aba === k ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700')}>
            {r}
          </button>
        ))}
      </div>
      {aba === 'conf' && <Presenca tipo="conferido" />}
      {aba === 'abada' && <Presenca tipo="abada" />}
      {aba === 'picos' && <Picos />}
      {aba === 'comp' && <Comparativo />}
      {aba === 'evento' && <PorEvento />}
    </div>
  )
}
