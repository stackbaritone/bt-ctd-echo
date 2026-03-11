import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// ESM-safe __dirname for Node 20+
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const writeTemplatesPlugin = {
  name: 'write-templates-plugin',
  apply: 'serve', // dev only
  configureServer(server) {
    server.middlewares.use('/__replace_templates', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        return res.end('Method Not Allowed')
      }
      try {
        let body = ''
        for await (const chunk of req) {
          body += chunk
        }
        const json = JSON.parse(body || '{}')
        if (!json || typeof json !== 'object' || !json.templates) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ ok: false, error: 'Invalid payload. Expected { metadata, variables, templates }.' }))
        }
        const root = process.cwd()
        const outPath = path.resolve(root, 'complete_email_templates.json')
        const publicDir = path.resolve(root, 'public')
        const outPublic = path.resolve(publicDir, 'complete_email_templates.json')
        
        fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8')
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
        fs.writeFileSync(outPublic, JSON.stringify(json, null, 2), 'utf-8')

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, path: outPath, public: outPublic }))
      } catch (e) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
  }
}

const copyStaticFilesPlugin = {
  name: 'copy-static-files',
  apply: 'build',
  writeBundle(options) {
    const outDir = options.dir || 'dist'
    const root = process.cwd()

    const copy = (src, dest) => {
      if (!fs.existsSync(src)) return
      const stat = fs.statSync(src)
      if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true })
        fs.readdirSync(src).forEach(file => {
          copy(path.join(src, file), path.join(dest, file))
        })
      } else {
        fs.copyFileSync(src, dest)
      }
    }

    try {
      fs.writeFileSync(path.resolve(outDir, '.nojekyll'), '')
    } catch (e) {
      console.warn('[copy-static-files] failed to write .nojekyll:', e.message)
    }

    const staticAssets = [
      { src: path.resolve(root, 'admin'), dest: path.resolve(outDir, 'admin') },
      { src: path.resolve(root, 'assets'), dest: path.resolve(outDir, 'assets') },
      { src: path.resolve(root, 'help.html'), dest: path.resolve(outDir, 'help.html') },
      { src: path.resolve(root, '404.html'), dest: path.resolve(outDir, '404.html') },
      { src: path.resolve(root, 'CNAME'), dest: path.resolve(outDir, 'CNAME') },
      { src: path.resolve(root, 'complete_email_templates.json'), dest: path.resolve(outDir, 'complete_email_templates.json') },
    ]

    staticAssets.forEach(({ src, dest }) => {
      try {
        copy(src, dest)
      } catch (e) {
        console.warn(`[copy-static-files] failed to copy ${src}:`, e.message)
      }
    })
  }
}

export default defineConfig(({ mode }) => {
  // Pour un sous-domaine dédié, base doit être '/'
  const base = '/';
  
  return {
    base: mode === 'production' ? base : '/',
    plugins: [
      react(),
      tailwindcss(),
      writeTemplatesPlugin,
      copyStaticFilesPlugin,
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      assetsInlineLimit: 0, 
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/__tests__/setup.js'],
    },
  }
})
