import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

function shellEntryResolverPlugin() {
  return {
    name: 'comergio-shell-entry-resolver',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const entryMatch = html.match(/<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/)
        if (!entryMatch) {
          return html
        }

        const fallbackEntry = entryMatch[1]
        const loader = `<script type="module">
async function loadComergioShell() {
  let entry = ${JSON.stringify(fallbackEntry)};
  try {
    const html = await fetch('/index.html?shell=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' }).then((response) => response.text());
    const match = html.match(/let entry = "(\\/assets\\/index-[^"]+\\.js)"/)
      || html.match(/src="(\\/?assets\\/index-[^"]+\\.js)"/);
    if (match) {
      entry = match[1].startsWith('/') ? match[1] : '/' + match[1];
    }
  } catch (error) {
    console.warn('[Comergio] shell resolver fallback', error);
  }
  await import(entry);
}
loadComergioShell();
</script>`

        return html.replace(entryMatch[0], loader)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  appType: 'spa',
  server: {
    proxy: {
      '/assets': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'ie >= 11'],
      modernPolyfills: true,
    }),
    shellEntryResolverPlugin(),
  ],
})
