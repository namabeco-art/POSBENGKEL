import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          manifest: {
            name: 'POS Hulio V2',
            short_name: 'POSHulio',
            description: 'Sistem Point of Sale untuk retail multi-cabang',
            theme_color: '#4f46e5',
            background_color: '#f8fafc',
            display: 'standalone',
            orientation: 'any',
            start_url: '/',
            icons: [
              {
                src: '/icon-192x192.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              },
              {
                src: '/icon-512x512.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
                if (id.includes('recharts')) return 'charts-vendor';
                if (id.includes('lucide-react')) return 'icons-vendor';
                return 'vendor';
              }

              if (id.includes('/pages/')) return 'app-pages';
              if (id.includes('/services/')) return 'app-services';
              if (id.includes('/components/')) return 'app-components';

              return undefined;
            }
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
