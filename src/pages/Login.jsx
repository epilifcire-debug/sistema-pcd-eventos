import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Botao, Card, Campo } from '../components/ui'

export default function Login() {
  const { avisar } = useApp()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ok, setOk] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setOk(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setOk(false)
    if (error) avisar(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : error.message, 'erro')
  }

  async function esqueci() {
    if (!email) return avisar('Digite seu e-mail primeiro', 'erro')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.href.split('#')[0] })
    avisar(error ? error.message : 'Se o e-mail existir, você vai receber um link para redefinir a senha.', error ? 'erro' : 'ok')
  }

  return (
    <div className="grid min-h-screen place-items-center p-4" style={{ background: 'linear-gradient(135deg,#8338ec,#ff006e,#ffbe0b)' }}>
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center justify-center gap-3">
          <img src="./logos/augustus.png" alt="" className="h-14 w-14 object-contain" />
          <img src="./logos/point.png" alt="Point do Ingresso" className="h-20 w-20 object-contain" />
          <img src="./logos/precaju.png" alt="" className="h-14 w-20 object-contain" />
        </div>
        <h1 className="mb-1 text-center text-xl font-bold dark:text-white">Sistema PCD Eventos</h1>
        <p className="mb-5 text-center text-sm text-gray-500">Entre com seu e-mail e senha</p>
        <form onSubmit={entrar} className="space-y-3">
          <Campo label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
          <Botao className="w-full" carregando={ok}>Entrar</Botao>
        </form>
        <button onClick={esqueci} className="mt-3 w-full text-center text-xs text-purple-600 hover:underline">Esqueci minha senha</button>
        <p className="mt-6 text-center text-xs text-gray-400">by: efcsys</p>
      </Card>
    </div>
  )
}
