import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'StockWise Smart Inventory',
        short_name: 'StockWise',
        description: 'Inventory management for small businesses',
        theme_color: '#142a21',
        background_color: '#f5f7f3',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [{
          urlPattern: /^https?:\/\/localhost:5000\/api\/.*/,
          handler: 'NetworkOnly',
        }],
      },
    }),
  ],
  server: { port: 5173 },
});
