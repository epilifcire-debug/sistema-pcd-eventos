import { useEffect, useState } from 'react'
import { X, User, Loader2 } from 'lucide-react'
import { urlFoto, urlFotoCache } from '../lib/supabase'
import { cx } from '../lib/utils'

export const Card = ({ className, children, ...p }) => (
  <div className={cx('bg-white dark:bg-gray-800 rounded-2xl shadow-xl', className)} {...p}>{children}</div>
)

const varBotao = {
  primario: 'bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:opacity-90 shadow-md',
  secundario: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
  verde: 'bg-green-600 text-white hover:bg-green-700',
  laranja: 'bg-orange-600 text-white hover:bg-orange-700',
  perigo: 'bg-red-500 text-white hover:bg-red-600',
  fantasma: 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200',
  contorno: 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100',
}
export function Botao({ v = 'primario', className, carregando, children, ...p }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none',
        varBotao[v], className
      )}
      disabled={carregando || p.disabled}
      {...p}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export const inputCls =
  'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-gray-100'

export function Campo({ label, obrigatorio, erro, className, children, ...p }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label} {obrigatorio && <span className="text-red-500">*</span>}
        </span>
      )}
      {children || <input className={inputCls} {...p} />}
      {erro && <span className="mt-1 block text-xs text-red-500">{erro}</span>}
    </label>
  )
}

export const Selecao = ({ className, children, ...p }) => (
  <select className={cx(inputCls, className)} {...p}>{children}</select>
)

export function Modal({ aberto, onFechar, titulo, children, largura = 'max-w-2xl' }) {
  useEffect(() => {
    if (!aberto) return
    const esc = (e) => e.key === 'Escape' && onFechar?.()
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onFechar}>
      <div
        className={cx('w-full bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto animate-[subir_.2s_ease-out]', largura)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">{titulo}</h3>
          <button onClick={onFechar} className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Confirmar({ aberto, titulo, texto, onSim, onNao, perigo = true, textoSim = 'Confirmar' }) {
  const [ok, setOk] = useState(false)
  return (
    <Modal aberto={aberto} onFechar={onNao} titulo={titulo} largura="max-w-md">
      <p className="text-sm text-gray-600 dark:text-gray-300">{texto}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Botao v="secundario" onClick={onNao}>Cancelar</Botao>
        <Botao v={perigo ? 'perigo' : 'primario'} carregando={ok} onClick={async () => { setOk(true); try { await onSim() } finally { setOk(false) } }}>
          {textoSim}
        </Botao>
      </div>
    </Modal>
  )
}

const corBadge = {
  roxo: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  verde: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  laranja: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  cinza: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  vermelho: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  azul: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
}
export const Badge = ({ cor = 'roxo', className, children }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', corBadge[cor], className)}>{children}</span>
)

// Foto vinda do bucket privado (URL assinada, carregada sob demanda)
export function Foto({ path, nome, className = 'h-12 w-12', onClick }) {
  const [url, setUrl] = useState(() => urlFotoCache(path))
  useEffect(() => {
    let vivo = true
    if (!path) return setUrl(null)
    urlFoto(path).then((u) => vivo && setUrl(u))
    return () => { vivo = false }
  }, [path])
  return url ? (
    <img src={url} alt={nome || 'Foto'} loading="lazy" onClick={onClick}
      className={cx('rounded-full object-cover bg-gray-200 shrink-0', onClick && 'cursor-zoom-in', className)} />
  ) : (
    <div className={cx('rounded-full bg-gray-200 dark:bg-gray-700 grid place-items-center shrink-0 text-gray-400', className)}>
      <User className="h-1/2 w-1/2" />
    </div>
  )
}

export const Vazio = ({ children }) => (
  <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">{children}</div>
)

export function Contador({ rotulo, valor, cor = 'text-purple-600' }) {
  return (
    <Card className="p-4 text-center">
      <div className={cx('text-2xl font-bold', cor)}>{valor}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{rotulo}</div>
    </Card>
  )
}

export function Titulo({ icone: I, children, acao }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
        {I && <I className="h-6 w-6 text-purple-600" />} {children}
      </h2>
      {acao}
    </div>
  )
}
