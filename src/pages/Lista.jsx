import { useMemo, useState } from 'react'
import { Users, Search, Pencil, Trash2, Eye, FileText, Phone, FolderOpen, HardDrive } from 'lucide-react'
import { useApp } from '../lib/store'
import { abrirDocumento, linkPastaDrive } from '../lib/drive'
import { normalizar, soDigitos, dataHora } from '../lib/utils'
import { Badge, Botao, Card, Confirmar, Foto, Modal, Selecao, Titulo, Vazio, inputCls } from '../components/ui'
import PessoaForm from '../components/PessoaForm'

export default function Lista() {
  const { pessoas, eventos, eventoPorId, eventosAtivosDaPessoa, inscPorPessoa, excluirPessoa, avisar, isAdmin } = useApp()
  const [busca, setBusca] = useState('')
  const [evento, setEvento] = useState('')
  const [status, setStatus] = useState('')
  const [limite, setLimite] = useState(60)
  const [editar, setEditar] = useState(null)
  const [ver, setVer] = useState(null)
  const [apagar, setApagar] = useState(null)
  const [fotoGrande, setFotoGrande] = useState(null)

  const filtradas = useMemo(() => {
    const t = normalizar(busca)
    const d = soDigitos(busca)
    return pessoas.filter((p) => {
      if (status && (p.status || 'ativo') !== status) return false
      if (evento && !eventosAtivosDaPessoa(p.id).includes(evento)) return false
      if (!t) return true
      return (
        normalizar(p.nome).includes(t) ||
        (d && (p.cpf_digitos?.includes(d) || soDigitos(p.telefone).includes(d))) ||
        normalizar(p.email).includes(t) ||
        normalizar(p.tipo_deficiencia).includes(t)
      )
    })
  }, [pessoas, busca, evento, status, eventosAtivosDaPessoa])

  return (
    <div>
      <Titulo icone={Users}>Cadastros <span className="text-sm font-normal text-gray-500">({filtradas.length})</span></Titulo>
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_220px_160px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className={inputCls + ' pl-9'} placeholder="Buscar por nome, CPF, e-mail, deficiência ou telefone"
            value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(60) }} />
        </div>
        <Selecao value={evento} onChange={(e) => setEvento(e.target.value)}>
          <option value="">Todos os eventos</option>
          {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </Selecao>
        <Selecao value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </Selecao>
      </Card>

      <Card className="divide-y divide-gray-100 dark:divide-gray-700">
        {filtradas.length === 0 && <Vazio>Nenhum cadastro encontrado.</Vazio>}
        {filtradas.slice(0, limite).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3 sm:p-4">
            <Foto path={p.foto_path} nome={p.nome} onClick={p.foto_path ? () => setFotoGrande(p) : undefined} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{p.nome}</span>
                {p.status === 'inativo' && <Badge cor="cinza">Inativo</Badge>}
              </div>
              <div className="text-xs text-gray-500">{p.cpf}{p.tipo_deficiencia ? ` · ${p.tipo_deficiencia}` : ''}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {eventosAtivosDaPessoa(p.id).map((id) => eventoPorId[id] && <Badge key={id}>{eventoPorId[id].nome}</Badge>)}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button title="Ver" onClick={() => setVer(p)} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"><Eye className="h-4 w-4" /></button>
              <button title="Editar" onClick={() => setEditar(p)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700"><Pencil className="h-4 w-4" /></button>
              <button title="Excluir" onClick={() => setApagar(p)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-gray-700"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {filtradas.length > limite && (
          <div className="p-3 text-center">
            <Botao v="secundario" onClick={() => setLimite((l) => l + 100)}>Carregar mais ({filtradas.length - limite})</Botao>
          </div>
        )}
      </Card>

      <Modal aberto={!!editar} onFechar={() => setEditar(null)} titulo="Editar cadastro">
        {editar && <PessoaForm key={editar.id} pessoa={editar} onSalvo={() => setEditar(null)} />}
      </Modal>

      <Modal aberto={!!ver} onFechar={() => setVer(null)} titulo="Detalhes do cadastro">
        {ver && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4">
              <Foto path={ver.foto_path} nome={ver.nome} className="h-20 w-20" />
              <div>
                <div className="text-lg font-semibold">{ver.nome}</div>
                <div className="text-gray-500">{ver.cpf}</div>
                {ver.telefone && <a href={`tel:${soDigitos(ver.telefone)}`} className="flex items-center gap-1 text-purple-600"><Phone className="h-3 w-3" />{ver.telefone}</a>}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {[['E-mail', ver.email], ['Deficiência', ver.tipo_deficiencia], ['CID', ver.cid], ['Status', ver.status],
                ['Acompanhante', ver.acompanhante], ['CPF acompanhante', ver.cpf_acompanhante]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd>{v || '—'}</dd></div>
              ))}
            </dl>
            {ver.observacoes && <p className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3">{ver.observacoes}</p>}
            <div>
              <div className="mb-1 text-xs text-gray-500">Eventos</div>
              <div className="space-y-1">
                {(inscPorPessoa[ver.id] || []).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2">
                    <Badge cor={i.status === 'ativa' ? 'roxo' : 'cinza'}>{eventoPorId[i.evento_id]?.nome || 'Evento removido'}</Badge>
                    {i.status !== 'ativa' && <span className="text-xs text-gray-400">cancelada</span>}
                    {i.conferido && <Badge cor="verde">Conferido {i.conferido_em ? dataHora(i.conferido_em) : '(sem horário)'}</Badge>}
                    {i.abada && <Badge cor="laranja">Abadá</Badge>}
                  </div>
                ))}
              </div>
            </div>
            {((ver.documentos || []).length > 0 || ver.drive_pasta_id) && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>Documentos</span>
                  {isAdmin && ver.drive_pasta_id && (
                    <a href={linkPastaDrive(ver.drive_pasta_id)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-purple-600 hover:underline">
                      <FolderOpen className="h-3 w-3" /> Pasta no Drive
                    </a>
                  )}
                </div>
                {(ver.documentos || []).map((d) => (
                  <button key={d.drive_id || d.path} className="flex items-center gap-2 text-purple-600 hover:underline"
                    onClick={() => abrirDocumento(d).catch((e) => avisar(e.message, 'erro'))}>
                    <FileText className="h-4 w-4" /> {d.nome} {d.drive_id && <HardDrive className="h-3 w-3 text-gray-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal aberto={!!fotoGrande} onFechar={() => setFotoGrande(null)} titulo={fotoGrande?.nome} largura="max-w-lg">
        {fotoGrande && <Foto path={fotoGrande.foto_path} className="h-auto w-full !rounded-xl" />}
      </Modal>

      <Confirmar aberto={!!apagar} titulo="Excluir cadastro"
        texto={`Excluir ${apagar?.nome}? A foto, os documentos e as inscrições também serão apagados.`}
        textoSim="Excluir" onNao={() => setApagar(null)}
        onSim={async () => {
          try { await excluirPessoa(apagar); avisar('Cadastro excluído') } catch (e) { avisar(e.message, 'erro') }
          setApagar(null)
        }} />
    </div>
  )
}
