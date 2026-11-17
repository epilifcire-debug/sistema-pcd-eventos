import { useEffect, useMemo, useState } from 'react'
import { Camera, ImagePlus, FileUp, Trash2, FileText, Save } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase, comprimirImagem, urlDocumento } from '../lib/supabase'
import { mascaraCPF, mascaraTelefone, cpfValido, soDigitos, dataBR, cx } from '../lib/utils'
import { Botao, Campo, Foto, Selecao, inputCls } from './ui'

const TIPOS = ['Física', 'Visual', 'Auditiva', 'Intelectual', 'TEA (Autismo)', 'Múltipla', 'Mobilidade reduzida']

const vazio = {
  nome: '', cpf: '', telefone: '', email: '', tipo_deficiencia: '', cid: '', status: 'ativo',
  acompanhante: '', cpf_acompanhante: '', observacoes: '', foto_path: null, documentos: [],
}

export default function PessoaForm({ pessoa, onSalvo }) {
  const { eventos, eventosDisponiveis, eventosAtivosDaPessoa, pessoas, salvarPessoa, avisar } = useApp()
  const editando = Boolean(pessoa?.id)
  const [f, setF] = useState(() => ({ ...vazio, ...(pessoa || {}) }))
  const [sel, setSel] = useState(() => (pessoa?.id ? eventosAtivosDaPessoa(pessoa.id) : []))
  const [novaFoto, setNovaFoto] = useState(null) // { file, preview }
  const [novosDocs, setNovosDocs] = useState([])
  const [docsRemovidos, setDocsRemovidos] = useState([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => () => novaFoto && URL.revokeObjectURL(novaFoto.preview), [novaFoto])

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  // eventos que aparecem para escolher: disponíveis + os que a pessoa já tem
  const opcoes = useMemo(() => {
    const ids = new Set([...eventosDisponiveis.map((e) => e.id), ...sel])
    return eventos.filter((e) => ids.has(e.id)).sort((a, b) => (a.data || '9').localeCompare(b.data || '9'))
  }, [eventos, eventosDisponiveis, sel])

  const duplicado = useMemo(() => {
    const d = soDigitos(f.cpf)
    if (d.length !== 11) return null
    return pessoas.find((p) => p.cpf_digitos === d && p.id !== pessoa?.id) || null
  }, [f.cpf, pessoas, pessoa])

  function escolherFoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setNovaFoto({ file, preview: URL.createObjectURL(file) })
  }

  async function salvar(e) {
    e.preventDefault()
    if (!f.nome.trim() || !f.cpf.trim()) return avisar('Nome e CPF são obrigatórios', 'erro')
    if (!cpfValido(f.cpf) && !confirm('O CPF parece inválido. Salvar mesmo assim?')) return
    if (duplicado && !editando) return avisar(`CPF já cadastrado para ${duplicado.nome}. Edite o cadastro existente.`, 'erro')

    setSalvando(true)
    try {
      const id = pessoa?.id || crypto.randomUUID().replace(/-/g, '')
      let foto_path = f.foto_path
      if (novaFoto) {
        const blob = await comprimirImagem(novaFoto.file)
        const caminho = `${id}/${Date.now()}.jpg`
        const { error } = await supabase.storage.from('fotos').upload(caminho, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        if (f.foto_path) await supabase.storage.from('fotos').remove([f.foto_path])
        foto_path = caminho
      }
      let documentos = (f.documentos || []).filter((d) => !docsRemovidos.includes(d.path))
      for (const file of novosDocs) {
        const caminho = `${id}/${Date.now()}_${file.name.replace(/[^\w.-]+/g, '_')}`
        const { error } = await supabase.storage.from('documentos').upload(caminho, file)
        if (error) throw error
        documentos.push({ nome: file.name, path: caminho })
      }
      if (docsRemovidos.length) await supabase.storage.from('documentos').remove(docsRemovidos)

      const dados = {
        nome: f.nome.trim(), cpf: mascaraCPF(f.cpf), telefone: f.telefone || null, email: f.email?.trim() || null,
        tipo_deficiencia: f.tipo_deficiencia || null, cid: f.cid || null, status: f.status,
        acompanhante: f.acompanhante || null, cpf_acompanhante: f.cpf_acompanhante || null,
        observacoes: f.observacoes || null, foto_path, documentos,
      }
      await salvarPessoa({ ...dados, id }, sel, editando)
      avisar(editando ? 'Cadastro atualizado!' : 'Cadastro salvo!')
      if (!editando) {
        setF(vazio); setSel([]); setNovaFoto(null); setNovosDocs([]); setDocsRemovidos([])
      }
      onSalvo?.()
    } catch (err) {
      avisar('Erro ao salvar: ' + err.message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-5 pb-20 sm:pb-0">
      {/* Foto */}
      <div className="flex items-center gap-4">
        {novaFoto ? (
          <img src={novaFoto.preview} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <Foto path={f.foto_path} nome={f.nome} className="h-24 w-24" />
        )}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700">
            <Camera className="h-4 w-4" /> Câmera
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 dark:bg-gray-700">
            <ImagePlus className="h-4 w-4" /> Galeria
            <input type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
          </label>
          {(novaFoto || f.foto_path) && (
            <Botao type="button" v="fantasma" onClick={() => { setNovaFoto(null); setF((x) => ({ ...x, foto_path: novaFoto ? x.foto_path : null })) }}>
              <Trash2 className="h-4 w-4" /> Remover
            </Botao>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nome completo" obrigatorio value={f.nome} onChange={set('nome')} />
        <Campo label="CPF" obrigatorio inputMode="numeric" value={f.cpf}
          onChange={(e) => setF((x) => ({ ...x, cpf: mascaraCPF(e.target.value) }))}
          erro={duplicado ? `CPF já cadastrado: ${duplicado.nome}` : f.cpf.length === 14 && !cpfValido(f.cpf) ? 'CPF inválido' : null} />
        <Campo label="Telefone" inputMode="tel" value={f.telefone || ''} onChange={(e) => setF((x) => ({ ...x, telefone: mascaraTelefone(e.target.value) }))} />
        <Campo label="E-mail" type="email" value={f.email || ''} onChange={set('email')} />
        <Campo label="Tipo de deficiência">
          <input className={inputCls} list="tipos-def" value={f.tipo_deficiencia || ''} onChange={set('tipo_deficiencia')} />
          <datalist id="tipos-def">{TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
        </Campo>
        <Campo label="CID" value={f.cid || ''} onChange={set('cid')} />
        <Campo label="Acompanhante" value={f.acompanhante || ''} onChange={set('acompanhante')} />
        <Campo label="CPF do acompanhante" inputMode="numeric" value={f.cpf_acompanhante || ''}
          onChange={(e) => setF((x) => ({ ...x, cpf_acompanhante: mascaraCPF(e.target.value) }))} />
        <Campo label="Status">
          <Selecao value={f.status} onChange={set('status')}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Selecao>
        </Campo>
      </div>

      {/* Eventos */}
      <div>
        <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Eventos</span>
        {opcoes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum evento ativo com data futura.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opcoes.map((e) => {
              const on = sel.includes(e.id)
              return (
                <button type="button" key={e.id}
                  onClick={() => setSel((s) => (on ? s.filter((x) => x !== e.id) : [...s, e.id]))}
                  className={cx('rounded-full border px-3 py-1.5 text-sm transition',
                    on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-purple-400')}>
                  {e.nome}{e.data ? ` · ${dataBR(e.data)}` : ''}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Documentos */}
      <div>
        <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Documentos</span>
        <div className="space-y-2">
          {(f.documentos || []).filter((d) => !docsRemovidos.includes(d.path)).map((d) => (
            <div key={d.path} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm">
              <button type="button" className="flex items-center gap-2 truncate text-purple-600 hover:underline"
                onClick={async () => { const u = await urlDocumento(d.path); if (u) window.open(u, '_blank') }}>
                <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{d.nome}</span>
              </button>
              <button type="button" onClick={() => setDocsRemovidos((r) => [...r, d.path])} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {novosDocs.map((file, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-purple-50 dark:bg-purple-900/20 px-3 py-2 text-sm">
              <span className="truncate">{file.name} (novo)</span>
              <button type="button" onClick={() => setNovosDocs((n) => n.filter((_, j) => j !== i))} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            <FileUp className="h-4 w-4" /> Adicionar documento
            <input type="file" multiple accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { setNovosDocs((n) => [...n, ...e.target.files]); e.target.value = '' }} />
          </label>
        </div>
      </div>

      <Campo label="Observações">
        <textarea className={inputCls} rows={3} value={f.observacoes || ''} onChange={set('observacoes')} />
      </Campo>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 p-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Botao className="w-full sm:w-auto" carregando={salvando}>
          <Save className="h-4 w-4" /> {editando ? 'Atualizar' : 'Salvar cadastro'}
        </Botao>
      </div>
    </form>
  )
}
