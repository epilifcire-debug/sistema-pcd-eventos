import { useEffect, useState } from 'react'
import { Settings, HardDrive, Link2, Unlink, FolderOpen, UploadCloud, CheckCircle2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { driveAcao, enviarParaDrive, linkPastaDrive } from '../lib/drive'
import { dataHora } from '../lib/utils'
import { Badge, Botao, Card, Confirmar, Titulo } from '../components/ui'

const CONTA = 'caixaspoint@gmail.com'

export default function Configuracoes() {
  const { drive, carregarDrive, pessoas, recarregar, avisar } = useApp()
  const [ocupado, setOcupado] = useState(false)
  const [desconectar, setDesconectar] = useState(false)
  const [migrando, setMigrando] = useState(null)

  // retorno do login do Google: #Configuracoes?google=ok
  useEffect(() => {
    const st = new URLSearchParams(window.location.hash.split('?')[1] || '').get('google')
    if (!st) return
    const msg = { ok: 'Google Drive conectado!', cancelado: 'Conexão cancelada.', expirado: 'O link expirou, tente de novo.', erro: 'Não foi possível conectar. Tente de novo.' }[st]
    avisar(msg || st, st === 'ok' ? 'ok' : 'erro')
    carregarDrive()
    window.history.replaceState(null, '', '#Configuracoes')
  }, [avisar, carregarDrive])

  async function conectar() {
    setOcupado(true)
    try {
      const r = await driveAcao({ action: 'auth_url', email: CONTA })
      window.location.href = (await r.json()).url
    } catch (e) {
      avisar(e.message, 'erro')
      setOcupado(false)
    }
  }

  const antigos = pessoas.filter((p) => (p.documentos || []).some((d) => d.path))

  async function migrar() {
    setMigrando({ feito: 0, total: antigos.length, falhas: 0 })
    let falhas = 0
    for (const [n, p] of antigos.entries()) {
      try {
        const velhos = p.documentos.filter((d) => d.path)
        const arquivos = []
        for (const d of velhos) {
          const { data, error } = await supabase.storage.from('documentos').download(d.path)
          if (error) throw error
          arquivos.push(new File([data], d.nome || d.path.split('/').pop(), { type: data.type }))
        }
        const r = await enviarParaDrive({ id: p.id, nome: p.nome, cpf: p.cpf, drive_pasta_id: p.drive_pasta_id }, arquivos)
        const documentos = [
          ...p.documentos.filter((d) => !d.path),
          ...r.arquivos.map((a) => ({ nome: a.nome, drive_id: a.drive_id, mime: a.mime })),
        ]
        const { error } = await supabase.from('pessoas').update({ documentos, drive_pasta_id: r.pasta_id }).eq('id', p.id)
        if (error) throw error
        await supabase.storage.from('documentos').remove(velhos.map((d) => d.path))
      } catch {
        falhas++
      }
      setMigrando({ feito: n + 1, total: antigos.length, falhas })
    }
    await recarregar()
    avisar(falhas ? `${falhas} cadastro(s) não migraram; tente de novo.` : 'Documentos enviados ao Google Drive!', falhas ? 'erro' : 'ok')
    setMigrando(null)
  }

  return (
    <div>
      <Titulo icone={Settings}>Configurações</Titulo>

      <Card className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <HardDrive className="h-5 w-5 text-purple-600" /> Google Drive (documentos)
        </div>
        {drive.conectado ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge cor="verde"><CheckCircle2 className="h-3 w-3" /> Conectado</Badge>
              <span className="font-medium">{drive.email}</span>
              {drive.conectado_em && <span className="text-xs text-gray-500">desde {dataHora(drive.conectado_em)}</span>}
            </div>
            <p className="text-gray-500">
              Os documentos e fotos de documentos vão para <b>Documentos PcD / nome do cadastro</b>. A foto de perfil continua no sistema.
            </p>
            <div className="flex flex-wrap gap-2">
              {drive.pasta_raiz && (
                <a href={linkPastaDrive(drive.pasta_raiz)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">
                  <FolderOpen className="h-4 w-4" /> Abrir "Documentos PcD"
                </a>
              )}
              <Botao v="contorno" onClick={conectar} carregando={ocupado}><Link2 className="h-4 w-4" /> Reconectar</Botao>
              <Botao v="contorno" className="text-red-500" onClick={() => setDesconectar(true)}><Unlink className="h-4 w-4" /> Desconectar</Botao>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">
              Conecte a conta <b>{CONTA}</b>. Enquanto não estiver conectado, os documentos ficam salvos no próprio sistema.
            </p>
            <Botao onClick={conectar} carregando={ocupado}><Link2 className="h-4 w-4" /> Conectar Google Drive</Botao>
          </div>
        )}
      </Card>

      {drive.conectado && antigos.length > 0 && (
        <Card className="p-5">
          <div className="mb-1 flex items-center gap-2 font-semibold"><UploadCloud className="h-5 w-5 text-purple-600" /> Documentos antigos</div>
          <p className="mb-3 text-sm text-gray-500">
            {antigos.length} cadastro(s) ainda têm documentos salvos no sistema. Envie para o Drive para ficar tudo no mesmo lugar.
          </p>
          {migrando ? (
            <div>
              <div className="mb-1 text-sm">Enviando… {migrando.feito}/{migrando.total}{migrando.falhas ? ` · ${migrando.falhas} falha(s)` : ''}</div>
              <div className="h-2 rounded bg-gray-200 dark:bg-gray-700">
                <div className="h-2 rounded bg-purple-600 transition-all" style={{ width: `${(migrando.feito / migrando.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <Botao onClick={migrar}><UploadCloud className="h-4 w-4" /> Enviar para o Google Drive</Botao>
          )}
        </Card>
      )}

      <Confirmar aberto={desconectar} titulo="Desconectar Google Drive" textoSim="Desconectar"
        texto="Os arquivos continuam no Drive, mas o sistema não vai conseguir abrir nem enviar documentos até conectar de novo."
        onNao={() => setDesconectar(false)}
        onSim={async () => {
          try { await driveAcao({ action: 'disconnect' }); await carregarDrive(); avisar('Desconectado') } catch (e) { avisar(e.message, 'erro') }
          setDesconectar(false)
        }} />
    </div>
  )
}
