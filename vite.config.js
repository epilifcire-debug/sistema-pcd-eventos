import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base './' funciona no GitHub Pages (subpasta) e em domínio próprio
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'logos/*.png'],
      manifest: {
        name: 'Sistema PCD Eventos',
        short_name: 'PCD Eventos',
        description: 'Cadastro, conferência e relatórios de PCD em eventos',
        theme_color: '#8338ec',
        background_color: '#f3f4f6',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { navigateFallback: null, runtimeCaching: [] },
    }),
  ],
})
