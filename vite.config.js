import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// This config is ESM (package.json sets "type": "module"), so `__dirname` is
// not defined. `import.meta.dirname` is the ESM equivalent.
const projectRoot = import.meta.dirname

// Four separate entry points — player, big screen, host console, admin.
// Keeping them separate means a delegate's phone downloads only the player
// bundle, not the host and admin code it will never run.
export default defineConfig({
  root: 'src',
  publicDir: resolve(projectRoot, 'public'),
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    // These pages are small and self-contained; inlining avoids extra round
    // trips on a congested venue network.
    assetsInlineLimit: 8192,
    rollupOptions: {
      input: {
        player: resolve(projectRoot, 'src/index.html'),
        screen: resolve(projectRoot, 'src/screen.html'),
        host:   resolve(projectRoot, 'src/host.html'),
        admin:  resolve(projectRoot, 'src/admin.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
})
