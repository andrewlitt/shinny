import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Netlify deploys to root, so no base path needed
  // For GitHub Pages, you would need: base: '/shinny/'
  base: '/',
  server: {
    proxy: {
      '/ckan': {
        target: 'https://ckan0.cf.opendata.inter.prod-toronto.ca',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ckan/, '')
      },
      '/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        secure: true,
        headers: {
          'User-Agent': 'shinny-local-dev'
        },
        rewrite: (path) => path.replace(/^\/nominatim/, '')
      }
    }
  }
})
