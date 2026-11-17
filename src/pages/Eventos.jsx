import { useState } from 'react'
import { Calendar, Plus, Pencil, Trash2, Power, MapPin, Users, ImagePlus } from 'lucide-react'
import { useApp, contaNoEvento } from '../lib/store'
import { supabase, comprimirImagem } from '../lib/supabase'
import { dataBR, hojeSP } from '../lib/utils'
import { Badge, Botao, Card, Campo, Confirmar, Foto, Modal, Titulo, Vazio, inputCls } from '../components/ui'

function EventoForm({ evento, onFechar }) {
  const { salvarEvento, avisar } = useApp()
  const [f, setF] = useState(() => ({ nome: '', data: '', local: '', descricao: '', ativo: true, imagem_url: '', ...(evento || {}) }))
  const [img, setImg] = useState(null)
  const [ok, setOk] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    if (!f.nome.trim()) return avisar('Informe o nome do evento', 'erro')
    setOk(true)
    try {
      let imagem_url = f.imagem_url || null
      if (img) {
        const blob = await comprimirImagem(img, 1400)
        const caminho = `${Date.now()}.jpg`
        const { error } = await supabase.storage.from('eventos').upload(caminho, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        imagem_url = supabase.storage.from('eventos').getPublicUrl(caminho).data.publicUrl
      }
      await salvarEvento({
        ...(evento?.id ? { id: evento.id } : {}),
        nome: f.nome.trim(), data: f.data || null, local: f.local || null, descricao: f.descricao || null, ativo: f.ativo, imagem_url,
      })
      avisar('Evento salvo!')
      onFechar()
    } catch (err) {
      avisar('Erro: ' + err.message, 'erro')
    } finally {
      setOk(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <Campo label="Nome" obrigatorio value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Data" type="date" value={f.data || ''} onChange={(e) => setF({ ...f, data: e.target.value })} />
        <Campo label="Local" value={f.local || ''} onChange={(e) => setF({ ...f, local: e.target.value })} />
      </div>
      <Campo label="Descrição">
        <textarea rows={3} className={inputCls} value={f.descricao || ''} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        {(img || f.imagem_url) && <img src={img ? URL.createObjectURL(img) : f.imagem_url} alt="" className="h-20 w-32 rounded-lg object-cover" />}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm">
          <ImagePlus className="h-4 w-4" /> Imagem do evento
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setImg(e.target.files?.[0] || null)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} className="h-4 w-4 accent-purple-600" />
        Evento ativo
      </label>
      {evento?.ativo && !f.ativo && (
        <p className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3 text-xs text-orange-700 dark:text-orange-300">
          Ao desativar, as inscrições ativas deste evento serão canceladas (fica registrado no histórico).
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Botao type="button" v="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao carregando={ok}>Salvar</Botao>
      </div>
    </form>
  )
}

export default function Eventos() {
  const { eventos, inscPorEvento, pessoaPorId, salvarEvento, excluirEvento, avisar } = useApp()
  const [form, setForm] = useState(null) // {} novo | evento
  const [apagar, setApagar] = useState(null)
  const [verInscritos, setVerInscritos] = useState(null)
  const hoje = hojeSP()

  const inscritos = (id) => (inscPorEvento[id] || []).filter(contaNoEvento)
  // ativos e futuros primeiro (por data), depois os encerrados (mais recentes primeiro)
  const ordenados = [...eventos].sort((a, b) => {
    const pa = a.ativo && (!a.data || a.data >= hoje) ? 0 : 1
    const pb = b.ativo && (!b.data || b.data >= hoje) ? 0 : 1
    if (pa !== pb) return pa - pb
    return pa === 0 ? (a.data || '9').localeCompare(b.data || '9') : (b.data || '').localeCompare(a.data || '')
  })

  return (
    <div>
      <Titulo icone={Calendar} acao={<Botao onClick={() => setForm({})}><Plus className="h-4 w-4" /> Novo evento</Botao>}>
        Eventos
      </Titulo>
      {eventos.length === 0 && <Card><Vazio>Nenhum evento cadastrado.</Vazio></Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordenados.map((e) => {
          const ins = inscritos(e.id)
          const passou = e.data && e.data < hoje
          return (
            <Card key={e.id} className="overflow-hidden">
              <div className="relative h-32 bg-gradient-to-r from-purple-600 via-pink-500 to-amber-400">
                {e.imagem_url && <img src={e.imagem_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                <div className="absolute right-2 top-2 flex gap-1">
                  <Badge cor={e.ativo ? 'verde' : 'cinza'}>{e.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  {passou && <Badge cor="laranja">Encerrado</Badge>}
                </div>
              </div>
              <div className="p-4">
                <div className="font-semibold">{e.nome}</div>
                <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                  {e.data && <div>{dataBR(e.data)}</div>}
                  {e.local && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.local}</div>}
                </div>
                <button onClick={() => setVerInscritos(e)} className="mt-2 flex items-center gap-1 text-sm text-purple-600 hover:underline">
                  <Users className="h-4 w-4" /> {ins.length} inscritos · {ins.filter((i) => i.conferido).length} conferidos
                </button>
                <div className="mt-3 flex gap-1">
                  <Botao v="contorno" className="flex-1 !px-2" onClick={async () => {
                    try { await salvarEvento({ id: e.id, ativo: !e.ativo }); avisar(e.ativo ? 'Evento desativado' : 'Evento ativado') } catch (err) { avisar(err.message, 'erro') }
                  }}>
                    <Power className="h-4 w-4" /> {e.ativo ? 'Desativar' : 'Ativar'}
                  </Botao>
                  <Botao v="contorno" className="!px-3" onClick={() => setForm(e)} title="Editar"><Pencil className="h-4 w-4" /></Botao>
                  <Botao v="contorno" className="!px-3 text-red-500" onClick={() => setApagar(e)} title="Excluir"><Trash2 className="h-4 w-4" /></Botao>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal aberto={!!form} onFechar={() => setForm(null)} titulo={form?.id ? 'Editar evento' : 'Novo evento'} largura="max-w-lg">
        {form && <EventoForm key={form.id || 'novo'} evento={form.id ? form : null} onFechar={() => setForm(null)} />}
      </Modal>

      <Modal aberto={!!verInscritos} onFechar={() => setVerInscritos(null)} titulo={`Inscritos — ${verInscritos?.nome || ''}`}>
        {verInscritos && (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {inscritos(verInscritos.id).length === 0 && <Vazio>Ninguém inscrito.</Vazio>}
            {inscritos(verInscritos.id)
              .map((i) => ({ i, p: pessoaPorId[i.pessoa_id] }))
              .filter((x) => x.p)
              .sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
              .map(({ i, p }) => (
                <div key={i.id} className="flex items-center gap-3 py-2">
                  <Foto path={p.foto_path} className="h-9 w-9" />
                  <span className="flex-1 truncate text-sm">{p.nome}</span>
                  {i.conferido && <Badge cor="verde">Conferido</Badge>}
                </div>
              ))}
          </div>
        )}
      </Modal>

      <Confirmar aberto={!!apagar} titulo="Excluir evento"
        texto={`Excluir "${apagar?.nome}"? Todas as inscrições e conferências deste evento serão apagadas. Para manter o histórico, prefira desativar.`}
        textoSim="Excluir" onNao={() => setApagar(null)}
        onSim={async () => {
          try { await excluirEvento(apagar.id); avisar('Evento excluído') } catch (err) { avisar(err.message, 'erro') }
          setApagar(null)
        }} />
    </div>
  )
}
