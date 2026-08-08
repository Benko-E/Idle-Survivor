import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  // Relative paths so the build works both from a web host (GitHub Pages,
  // which serves us from a /Idle-Survivor/ subpath) and from a bare file on disk.
  base: './',

  // Everything gets inlined into a single dist/index.html. That one file is
  // both what GitHub Pages serves and what you can send to someone directly.
  plugins: [viteSingleFile()],

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
})
