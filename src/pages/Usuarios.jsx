import { useCallback, useEffect, useState } from 'react'
import { UserCog, Plus, KeyRound, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Badge, Botao, Card, Campo, Confirmar, Modal, Selecao, Titulo, Vazio } from '../components/ui'
import { loginParaEmail, nomeDeLogin, normalizarUsuario } from '../lib/utils'

const PERFIS = { admin: 'Administrador', user: 'Usuário', leitor: 'Leitor' }

async function chamar(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* sem corpo */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function FormUsuario({ usuario, onFechar, onSalvo }) {
  const { isAdmin, avisar } = useApp()
  const novo = !usuario
  const [f, setF] = useState(() => ({
    nome: '', usuario: '', password: '', role: 'user', acesso_conferidos: true, acesso_abada: true, ativo: true, ...(usuario || {}),
  }))
  const [ok, setOk] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    setOk(true)
    try {
      if (novo) {
        if (!f.usuario.trim()) throw new Error('Informe o usuário')
        await chamar({ action: 'create', ...f, email: loginParaEmail(f.usuario) })
      }
      else await chamar({ action: 'update', id: usuario.id, nome: f.nome, role: f.role, acesso_conferidos: f.acesso_conferidos, acesso_abada: f.acesso_abada, ativo: f.ativo })
      avisar(novo ? 'Usuário criado! Ele vai trocar a senha no primeiro acesso.' : 'Usuário atualizado')
      onSalvo()
      onFechar()
    } catch (err) { avisar(err.message, 'erro') } finally { setOk(false) }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <Campo label="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
      {novo && (
        <>
          <Campo label="Usuário (login)" obrigatorio value={f.usuario} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="ex.: porta1 ou joao.silva"
            onChange={(e) => setF({ ...f, usuario: e.target.value.includes('@') ? e.target.value.trim() : normalizarUsuario(e.target.value) })} />
          <Campo label="Senha provisória" obrigatorio type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </>
      )}
      <Campo label="Perfil">
        <Selecao value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {isAdmin && <option value="admin">Administrador</option>}
          <option value="user">Usuário</option>
          <option value="leitor">Leitor</option>
        </Selecao>
      </Campo>
      {f.role === 'leitor' && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900">
          <div className="text-xs text-gray-500">O leitor só vê as telas marcadas e não desfaz conferências.</div>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-purple-600" checked={f.acesso_conferidos} onChange={(e) => setF({ ...f, acesso_conferidos: e.target.checked })} /> Acesso a Conferidos</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-purple-600" checked={f.acesso_abada} onChange={(e) => setF({ ...f, acesso_abada: e.target.checked })} /> Acesso a Abadá</label>
        </div>
      )}
      {!novo && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-purple-600" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Conta ativa</label>
      )}
      <div className="flex justify-end gap-2">
        <Botao type="button" v="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao carregando={ok}>Salvar</Botao>
      </div>
    </form>
  )
}

export default function Usuarios() {
  const { profile, isAdmin, avisar } = useApp()
  const [lista, setLista] = useState([])
  const [form, setForm] = useState(null) // 'novo' | usuario
  const [senha, setSenha] = useState(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [apagar, setApagar] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('nome')
    if (error) avisar(error.message, 'erro'); else setLista(data)
  }, [avisar])
  useEffect(() => { carregar() }, [carregar])

  const podeEditar = (u) => isAdmin || u.role !== 'admin'

  return (
    <div>
      <Titulo icone={UserCog} acao={<Botao onClick={() => setForm('novo')}><Plus className="h-4 w-4" /> Novo usuário</Botao>}>Usuários</Titulo>
      <Card className="divide-y divide-gray-100 dark:divide-gray-700">
        {lista.length === 0 && <Vazio>Nenhum usuário.</Vazio>}
        {lista.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-600 to-pink-500 font-bold text-white">
              {(u.nome || nomeDeLogin(u.email) || '?').trim()[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{u.nome || '—'}</span>
                <Badge cor={u.role === 'admin' ? 'roxo' : u.role === 'leitor' ? 'azul' : 'cinza'}>{PERFIS[u.role]}</Badge>
                {!u.ativo && <Badge cor="vermelho">Desativado</Badge>}
                {u.id === profile.id && <Badge cor="verde">Você</Badge>}
              </div>
              <div className="truncate text-xs text-gray-500">{nomeDeLogin(u.email)}</div>
              {u.role === 'leitor' && (
                <div className="text-xs text-gray-400">{[u.acesso_conferidos && 'Conferidos', u.acesso_abada && 'Abadá'].filter(Boolean).join(' · ') || 'Sem telas'}</div>
              )}
            </div>
            {podeEditar(u) && (
              <div className="flex shrink-0 gap-1">
                <button title="Editar" onClick={() => setForm(u)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700"><Pencil className="h-4 w-4" /></button>
                <button title="Redefinir senha" onClick={() => { setSenha(u); setNovaSenha('') }} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-gray-700"><KeyRound className="h-4 w-4" /></button>
                {isAdmin && u.id !== profile.id && (
                  <button title="Excluir" onClick={() => setApagar(u)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-gray-700"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>

      <Modal aberto={!!form} onFechar={() => setForm(null)} titulo={form === 'novo' ? 'Novo usuário' : 'Editar usuário'} largura="max-w-md">
        {form && <FormUsuario key={form.id || 'novo'} usuario={form === 'novo' ? null : form} onFechar={() => setForm(null)} onSalvo={carregar} />}
      </Modal>

      <Modal aberto={!!senha} onFechar={() => setSenha(null)} titulo={`Redefinir senha — ${senha?.nome || nomeDeLogin(senha?.email) || ''}`} largura="max-w-md">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault()
          try { await chamar({ action: 'reset_password', id: senha.id, password: novaSenha }); avisar('Senha redefinida. Ele vai trocar no próximo acesso.'); setSenha(null) }
          catch (err) { avisar(err.message, 'erro') }
        }}>
          <Campo label="Nova senha provisória" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
          <div className="flex justify-end"><Botao>Redefinir</Botao></div>
        </form>
      </Modal>

      <Confirmar aberto={!!apagar} titulo="Excluir usuário" textoSim="Excluir"
        texto={`Excluir a conta de ${apagar?.nome || nomeDeLogin(apagar?.email)}? Para só bloquear o acesso, prefira desativar.`}
        onNao={() => setApagar(null)}
        onSim={async () => {
          try { await chamar({ action: 'delete', id: apagar.id }); avisar('Usuário excluído'); carregar() } catch (err) { avisar(err.message, 'erro') }
          setApagar(null)
        }} />
    </div>
  )
}
