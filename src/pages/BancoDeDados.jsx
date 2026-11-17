import { useMemo, useState } from 'react'
import { Database, Search, FileSpreadsheet, Images, Package, AlertTriangle, Download, ShieldAlert } from 'lucide-react'
import { useApp, contaNoEvento } from '../lib/store'
import { supabase } from '../lib/supabase'
import { chavePessoa } from '../lib/relatorios'
import { normalizar, soDigitos, dataBR, gerarCSV, baixarArquivo, carimbo, nomeArquivo, cx } from '../lib/utils'
import { Badge, Botao, Card, Contador, Foto, Modal, Selecao, Titulo, Vazio, inputCls } from '../components/ui'

const arquivoFoto = (l) => `${nomeArquivo(l.nome)}_${soDigitos(l.cpf) || 'SEMCPF'}.jpg`

export default function BancoDeDados() {
  const { pessoas, eventos, eventoPorId, inscPorPessoa, avisar } = useApp()
  const [sel, setSel] = useState([])
  const [busca, setBusca] = useState('')
  const [foto, setFoto] = useState('todos')
  const [limite, setLimite] = useState(50)
  const [progresso, setProgresso] = useState(null)
  const [ampliada, setAmpliada] = useState(null)

  // pessoas únicas (CPF ou nome normalizado), juntando eventos
  const unicas = useMemo(() => {
    const m = new Map()
    for (const p of pessoas) {
      const evs = (inscPorPessoa[p.id] || []).filter((i) => contaNoEvento(i) || i.conferido).map((i) => i.evento_id)
      if (sel.length && !evs.some((e) => sel.includes(e))) continue
      const k = chavePessoa(p)
      const ex = m.get(k)
      if (!ex) m.set(k, { chave: k, nome: p.nome.trim(), cpf: p.cpf, foto_path: p.foto_path, eventos: new Set(evs) })
      else {
        evs.forEach((e) => ex.eventos.add(e))
        if (!ex.foto_path && p.foto_path) ex.foto_path = p.foto_path
      }
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [pessoas, inscPorPessoa, sel])

  const filtradas = useMemo(() => {
    const t = normalizar(busca); const d = soDigitos(busca)
    return unicas.filter((l) => (foto === 'todos' || (foto === 'com' ? l.foto_path : !l.foto_path)) &&
      (!t || normalizar(l.nome).includes(t) || (d && soDigitos(l.cpf).includes(d))))
  }, [unicas, busca, foto])

  const nomesEventos = (l) => [...l.eventos].map((id) => eventoPorId[id]?.nome).filter(Boolean).join(', ')
  const linhaVinculo = (l) => [l.nome, l.cpf, l.foto_path ? arquivoFoto(l) : '', nomesEventos(l), l.foto_path ? 'Com foto' : 'Sem foto']
  const cabVinculo = ['Nome', 'CPF', 'Arquivo da foto', 'Eventos', 'Status da foto']

  function planilha() {
    baixarArquivo(gerarCSV(cabVinculo, filtradas.map(linhaVinculo)), `banco_pessoas_${carimbo()}.csv`)
  }
  function pendencias() {
    const sem = filtradas.filter((l) => !l.foto_path)
    baixarArquivo(gerarCSV(['Nome', 'CPF', 'Eventos'], sem.map((l) => [l.nome, l.cpf, nomesEventos(l)])), `pendencias_sem_foto_${carimbo()}.csv`)
  }

  async function zip(linhas, comPlanilha, nome) {
    const comFoto = linhas.filter((l) => l.foto_path)
    if (!comFoto.length) return avisar('Nenhuma foto para baixar', 'erro')
    const { default: JSZip } = await import('jszip')
    const z = new JSZip()
    const pasta = z.folder('fotos')
    const falhas = []
    setProgresso({ feito: 0, total: comFoto.length })
    for (let i = 0; i < comFoto.length; i += 8) {
      await Promise.all(comFoto.slice(i, i + 8).map(async (l) => {
        const { data, error } = await supabase.storage.from('fotos').download(l.foto_path)
        if (error || !data) falhas.push(l.nome)
        else pasta.file(arquivoFoto(l), data)
      }))
      setProgresso({ feito: Math.min(i + 8, comFoto.length), total: comFoto.length })
    }
    if (comPlanilha) z.file('vinculos.csv', gerarCSV(cabVinculo, linhas.map(linhaVinculo)))
    if (falhas.length) z.file('falhas.txt', falhas.join('\n'))
    const blob = await z.generateAsync({ type: 'blob' })
    baixarArquivo(blob, nome)
    setProgresso(null)
    if (falhas.length) avisar(`${falhas.length} foto(s) não baixaram — veja falhas.txt`, 'erro')
  }

  return (
    <div>
      <Titulo icone={Database}>Banco de Dados — Pessoas e Fotos</Titulo>
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Dados pessoais e fotos protegidos pela LGPD. Baixe apenas para uso no sistema de acesso do evento e apague as cópias depois.
      </p>

      <Card className="mb-4 space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSel([])} className={cx('rounded-full border px-3 py-1 text-sm', !sel.length ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 dark:border-gray-600')}>Todos os eventos</button>
          {eventos.map((e) => {
            const on = sel.includes(e.id)
            return (
              <button key={e.id} onClick={() => setSel((s) => (on ? s.filter((x) => x !== e.id) : [...s, e.id]))}
                className={cx('rounded-full border px-3 py-1 text-sm', on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 dark:border-gray-600')}>
                {e.nome}{e.data ? ` · ${dataBR(e.data)}` : ''}
              </button>
            )
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input className={inputCls + ' pl-9'} placeholder="Nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Selecao value={foto} onChange={(e) => setFoto(e.target.value)}>
            <option value="todos">Com e sem foto</option>
            <option value="com">Com foto</option>
            <option value="sem">Sem foto</option>
          </Selecao>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Contador rotulo="Pessoas únicas" valor={filtradas.length} />
        <Contador rotulo="Com foto" valor={filtradas.filter((l) => l.foto_path).length} cor="text-green-600" />
        <Contador rotulo="Sem foto" valor={filtradas.filter((l) => !l.foto_path).length} cor="text-orange-600" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Botao v="contorno" onClick={planilha}><FileSpreadsheet className="h-4 w-4" /> Planilha</Botao>
        <Botao v="contorno" onClick={() => zip(filtradas, false, `fotos_${carimbo()}.zip`)} disabled={!!progresso}><Images className="h-4 w-4" /> Fotos (ZIP)</Botao>
        <Botao onClick={() => zip(filtradas, true, `pacote_completo_${carimbo()}.zip`)} disabled={!!progresso}><Package className="h-4 w-4" /> Pacote completo</Botao>
        <Botao v="contorno" onClick={pendencias}><AlertTriangle className="h-4 w-4" /> Pendências (sem foto)</Botao>
      </div>
      {progresso && (
        <Card className="mb-4 p-4">
          <div className="mb-1 text-sm">Baixando fotos… {progresso.feito}/{progresso.total}</div>
          <div className="h-2 rounded bg-gray-200 dark:bg-gray-700"><div className="h-2 rounded bg-purple-600 transition-all" style={{ width: `${(progresso.feito / progresso.total) * 100}%` }} /></div>
        </Card>
      )}

      <Card className="divide-y divide-gray-100 dark:divide-gray-700">
        {filtradas.length === 0 && <Vazio>Ninguém encontrado.</Vazio>}
        {filtradas.slice(0, limite).map((l) => (
          <div key={l.chave} className="flex items-center gap-3 p-3">
            <Foto path={l.foto_path} nome={l.nome} className="h-12 w-12" onClick={l.foto_path ? () => setAmpliada(l) : undefined} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{l.nome}</div>
              <div className="text-xs text-gray-500">{l.cpf}</div>
              <div className="truncate text-xs text-gray-400">{nomesEventos(l)}</div>
            </div>
            {l.foto_path ? (
              <button title="Baixar foto + vínculo" onClick={() => zip([l], true, `${arquivoFoto(l).replace('.jpg', '')}.zip`)}
                className="rounded-lg p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700"><Download className="h-4 w-4" /></button>
            ) : <Badge cor="laranja">Sem foto</Badge>}
          </div>
        ))}
        {filtradas.length > limite && (
          <div className="p-3 text-center"><Botao v="secundario" onClick={() => setLimite((x) => x + 50)}>Carregar mais ({filtradas.length - limite})</Botao></div>
        )}
      </Card>

      <Modal aberto={!!ampliada} onFechar={() => setAmpliada(null)} titulo={ampliada?.nome} largura="max-w-lg">
        {ampliada && <Foto path={ampliada.foto_path} className="h-auto w-full !rounded-xl" />}
      </Modal>
    </div>
  )
}
