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
    /**
     * Committed to the repo and served by GitHub Pages directly, rather than
     * built in CI.
     *
     * Licensed art can't live in a public repo — the GameDev Market licence
     * forbids sharing assets "other than as part of the relevant Media
     * Product" — so the source images stay in a gitignored folder on the dev
     * machine. CI therefore can't build, and the built page is the artefact we
     * publish instead. It embeds the art as base64, which is the Media
     * Product, not a served asset folder.
     */
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
})
