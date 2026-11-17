import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react'
import {
  addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, addDays, parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useApp, contaNoEvento } from '../lib/store'
import { hojeSP, dataBR, cx } from '../lib/utils'
import { Badge, Botao, Card, Titulo, Vazio } from '../components/ui'

export default function Calendario() {
  const { eventos, inscPorEvento } = useApp()
  const hoje = hojeSP()
  const [mes, setMes] = useState(() => startOfMonth(parseISO(hoje)))
  const [dia, setDia] = useState(hoje)

  const porData = useMemo(() => {
    const m = {}
    for (const e of eventos) if (e.data) (m[e.data] ||= []).push(e)
    return m
  }, [eventos])

  const dias = useMemo(() => {
    const ini = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 })
    const fim = endOfWeek(endOfMonth(mes), { weekStartsOn: 0 })
    const out = []
    for (let d = ini; d <= fim; d = addDays(d, 1)) out.push(d)
    return out
  }, [mes])

  const inscritos = (id) => (inscPorEvento[id] || []).filter(contaNoEvento).length
  const conferidos = (id) => (inscPorEvento[id] || []).filter((i) => i.conferido).length
  const doDia = porData[dia] || []
  const proximos = eventos.filter((e) => e.data && e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 6)

  return (
    <div>
      <Titulo icone={CalendarDays}>Calendário</Titulo>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Botao v="fantasma" onClick={() => setMes((m) => addMonths(m, -1))}><ChevronLeft className="h-4 w-4" /></Botao>
            <div className="text-center">
              <div className="font-semibold capitalize">{format(mes, 'MMMM yyyy', { locale: ptBR })}</div>
              <button className="text-xs text-purple-600" onClick={() => { setMes(startOfMonth(parseISO(hoje))); setDia(hoje) }}>Hoje</button>
            </div>
            <Botao v="fantasma" onClick={() => setMes((m) => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Botao>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map((d) => {
              const k = format(d, 'yyyy-MM-dd')
              const evs = porData[k] || []
              return (
                <button key={k} onClick={() => setDia(k)}
                  className={cx('min-h-[56px] sm:min-h-[80px] rounded-lg p-1 text-left text-xs transition border',
                    !isSameMonth(d, mes) && 'opacity-40',
                    k === dia ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700',
                    k === hoje && 'font-bold text-purple-600')}>
                  <div>{format(d, 'd')}</div>
                  {evs.slice(0, 2).map((e) => (
                    <div key={e.id} className={cx('mt-0.5 truncate rounded px-1 text-[10px] text-white', e.ativo ? 'bg-gradient-to-r from-purple-600 to-pink-500' : 'bg-gray-400')}>{e.nome}</div>
                  ))}
                  {evs.length > 2 && <div className="text-[10px] text-gray-500">+{evs.length - 2}</div>}
                </button>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 font-semibold">{dataBR(dia)}</div>
            {doDia.length === 0 ? <Vazio>Nenhum evento neste dia.</Vazio> : doDia.map((e) => (
              <div key={e.id} className="mb-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.nome}</span>
                  <Badge cor={e.ativo ? 'verde' : 'cinza'}>{e.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </div>
                {e.local && <div className="mt-1 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" />{e.local}</div>}
                <div className="mt-2 flex gap-3 text-xs">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{inscritos(e.id)} inscritos</span>
                  <span className="text-green-600">{conferidos(e.id)} conferidos</span>
                </div>
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <div className="mb-2 font-semibold">Próximos eventos</div>
            {proximos.length === 0 ? <Vazio>Nenhum.</Vazio> : proximos.map((e) => (
              <button key={e.id} onClick={() => { setDia(e.data); setMes(startOfMonth(parseISO(e.data))) }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                <span className="truncate">{e.nome}</span>
                <span className="shrink-0 text-xs text-gray-500">{dataBR(e.data)}</span>
              </button>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
