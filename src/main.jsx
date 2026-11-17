import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { AppProvider } from './lib/store'
import { configurado } from './lib/supabase'

function SemConfig() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 32, maxWidth: 520, margin: '40px auto' }}>
      <h2>Configuração pendente</h2>
      <p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> ou secrets do GitHub) e gere o build de novo.</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {configurado ? (
      <AppProvider>
        <App />
      </AppProvider>
    ) : (
      <SemConfig />
    )}
  </React.StrictMode>
)
