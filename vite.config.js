import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Four separate entry points — player, big screen, host console, admin.
// Keeping them separate means a delegate's phone downloads only the player
// bundle, not the host and admin code it will never run.
export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    // Small, self-contained pages — inlining avoids extra round trips on a
    // congested venue network.
    assetsInlineLimit: 8192,
    rollupOptions: {
      input: {
        player: resolve(__dirname, 'src/index.html'),
        screen: resolve(__dirname, 'src/screen.html'),
        host:   resolve(__dirname, 'src/host.html'),
        admin:  resolve(__dirname, 'src/admin.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
})
