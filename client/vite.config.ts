import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true, // accessible depuis un téléphone : http://<IP-du-PC>:5173
    proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } },
  },
});
