import { useMemo, useState } from 'react'
import { Printer, DownloadCloud, UploadCloud, AlertOctagon } from 'lucide-react'
import { useApp, contaNoEvento } from '../lib/store'
import { supabase, buscarTudo } from '../lib/supabase'
import { dataBR, dataHora, baixarArquivo, carimbo, cx } from '../lib/utils'
import { Botao, Card, Confirmar, Foto, Selecao, Titulo } from '../components/ui'

const COLUNAS = [
  ['foto', 'Foto'], ['cpf', 'CPF'], ['telefone', 'Telefone'], ['tipo_deficiencia', 'Deficiência'],
  ['cid', 'CID'], ['acompanhante', 'Acompanhante'], ['status', 'Conferido'], ['assinatura', 'Assinatura'],
]

export default function Impressao() {
  const { eventos, inscPorEvento, pessoaPorId, pessoas, isAdmin, recarregar, avisar } = useApp()
  const [ev, setEv] = useState('')
  const [cols, setCols] = useState(['foto', 'cpf', 'tipo_deficiencia', 'acompanhante', 'assinatura'])
  const [importando, setImportando] = useState(false)
  const [reset, setReset] = useState(false)

  const evento = eventos.find((e) => e.id === ev)
  const linhas = useMemo(() => {
    const base = ev
      ? (inscPorEvento[ev] || []).filter(contaNoEvento).map((i) => ({ i, p: pessoaPorId[i.pessoa_id] })).filter((x) => x.p)
      : pessoas.map((p) => ({ i: null, p }))
    return base.sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
  }, [ev, inscPorEvento, pessoaPorId, pessoas])

  const on = (c) => cols.includes(c)

  async function exportar() {
    try {
      const [ev2, pe, ins, hist] = await Promise.all([
        buscarTudo('eventos'), buscarTudo('pessoas'), buscarTudo('inscricoes'), buscarTudo('historico_cancelamento'),
      ])
      const dados = { versao: 2, gerado_em: new Date().toISOString(), eventos: ev2, pessoas: pe, inscricoes: ins, historico_cancelamento: hist }
      baixarArquivo(JSON.stringify(dados, null, 2), `backup_pcd_${carimbo()}.json`, 'application/json')
    } catch (e) { avisar(e.message, 'erro') }
  }

  async function importar(file) {
    setImportando(true)
    try {
      const d = JSON.parse(await file.text())
      if (d.versao !== 2) throw new Error('Arquivo não é um backup deste sistema. Para o backup do Base44 use o script de importação.')
      const limpa = (arr, sem = []) => (arr || []).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !sem.includes(k))))
      if (d.eventos?.length) { const { error } = await supabase.from('eventos').upsert(limpa(d.eventos)); if (error) throw error }
      if (d.pessoas?.length) { const { error } = await supabase.from('pessoas').upsert(limpa(d.pessoas, ['cpf_digitos'])); if (error) throw error }
      if (d.inscricoes?.length) {
        const { error } = await supabase.from('inscricoes').upsert(limpa(d.inscricoes, ['id']), { onConflict: 'pessoa_id,evento_id' })
        if (error) throw error
      }
      if (d.historico_cancelamento?.length) await supabase.from('historico_cancelamento').upsert(d.historico_cancelamento)
      await recarregar()
      avisar('Backup importado!')
    } catch (e) { avisar('Erro: ' + e.message, 'erro') } finally { setImportando(false) }
  }

  return (
    <div>
      <div className="no-print">
        <Titulo icone={Printer}>Impressão</Titulo>
        <Card className="mb-4 space-y-3 p-4">
          <Selecao value={ev} onChange={(e) => setEv(e.target.value)}>
            <option value="">Todos os cadastros</option>
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.data ? ` — ${dataBR(e.data)}` : ''}</option>)}
          </Selecao>
          <div className="flex flex-wrap gap-2">
            {COLUNAS.map(([k, r]) => (
              <button key={k} onClick={() => setCols((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))}
                className={cx('rounded-full border px-3 py-1 text-sm', on(k) ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 dark:border-gray-600')}>{r}</button>
            ))}
          </div>
          <Botao onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / Salvar PDF ({linhas.length})</Botao>
        </Card>
      </div>

      <Card className="overflow-x-auto p-4 print:p-0">
        <div className="mb-3 flex items-center gap-3">
          <img src="./logos/point.png" alt="" className="h-12 w-12" />
          <div>
            <div className="font-bold">{evento ? evento.nome : 'Todos os cadastros'}{evento?.data ? ` — ${dataBR(evento.data)}` : ''}</div>
            <div className="text-xs text-gray-500">{linhas.length} pessoas · {dataHora(new Date().toISOString())}</div>
          </div>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left">
              <th className="py-1 pr-2">#</th>
              {on('foto') && <th className="pr-2">Foto</th>}
              <th className="pr-2">Nome</th>
              {on('cpf') && <th className="pr-2">CPF</th>}
              {on('telefone') && <th className="pr-2">Telefone</th>}
              {on('tipo_deficiencia') && <th className="pr-2">Deficiência</th>}
              {on('cid') && <th className="pr-2">CID</th>}
              {on('acompanhante') && <th className="pr-2">Acompanhante</th>}
              {on('status') && ev && <th className="pr-2">Conferido</th>}
              {on('assinatura') && <th className="w-40">Assinatura</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ i, p }, n) => (
              <tr key={p.id} className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-1 pr-2">{n + 1}</td>
                {on('foto') && <td className="py-1 pr-2"><Foto path={p.foto_path} className="h-10 w-10" /></td>}
                <td className="pr-2 font-medium">{p.nome}</td>
                {on('cpf') && <td className="whitespace-nowrap pr-2">{p.cpf}</td>}
                {on('telefone') && <td className="whitespace-nowrap pr-2">{p.telefone}</td>}
                {on('tipo_deficiencia') && <td className="pr-2">{p.tipo_deficiencia}</td>}
                {on('cid') && <td className="pr-2">{p.cid}</td>}
                {on('acompanhante') && <td className="pr-2">{p.acompanhante}</td>}
                {on('status') && ev && <td className="pr-2">{i?.conferido ? 'Sim' : ''}</td>}
                {on('assinatura') && <td className="border-b border-gray-400"></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="no-print mt-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="mb-1 font-semibold">Backup</div>
          <p className="mb-3 text-xs text-gray-500">Baixa eventos, cadastros, inscrições e histórico em JSON (as fotos ficam no Supabase Storage).</p>
          <div className="flex flex-wrap gap-2">
            <Botao v="contorno" onClick={exportar}><DownloadCloud className="h-4 w-4" /> Exportar JSON</Botao>
            <label className={cx('inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600', importando && 'opacity-50')}>
              <UploadCloud className="h-4 w-4" /> {importando ? 'Importando…' : 'Importar JSON'}
              <input type="file" accept="application/json" className="hidden" disabled={importando}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importar(f) }} />
            </label>
          </div>
        </Card>
        {isAdmin && (
          <Card className="border border-red-200 p-4 dark:border-red-900">
            <div className="mb-1 flex items-center gap-2 font-semibold text-red-600"><AlertOctagon className="h-4 w-4" /> Resetar sistema</div>
            <p className="mb-3 text-xs text-gray-500">Apaga TODOS os cadastros, eventos, inscrições e histórico. Faça um backup antes.</p>
            <Botao v="perigo" onClick={() => setReset(true)}>Resetar</Botao>
          </Card>
        )}
      </div>

      <Confirmar aberto={reset} titulo="Resetar sistema" textoSim="Apagar tudo"
        texto="Isso não pode ser desfeito. Todos os cadastros, eventos, inscrições e histórico serão apagados."
        onNao={() => setReset(false)}
        onSim={async () => {
          const { error } = await supabase.rpc('resetar_sistema')
          if (error) avisar(error.message, 'erro'); else { avisar('Sistema resetado'); await recarregar() }
          setReset(false)
        }} />
    </div>
  )
}
