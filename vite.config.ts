import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // '/' locally; CI sets OATH_BASE=/oath/ for GitHub Pages project hosting.
  base: process.env.OATH_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Include the knight card art so the installed app is fully offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        maximumFileSizeToCacheInBytes: 5_000_000,
        // New versions take over immediately (paired with registerSW reload).
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'Oath',
        short_name: 'OATH',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
