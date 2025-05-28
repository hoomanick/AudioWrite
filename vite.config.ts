import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    const ghRepoEnvVar = process.env.GITHUB_REPOSITORY_NAME;
    let repositoryNameForBase = 'AudioWrite'; 

    if (ghRepoEnvVar) {
      if (ghRepoEnvVar.includes('/')) {
        repositoryNameForBase = ghRepoEnvVar.split('/').pop() || 'AudioWrite';
      } else {
        repositoryNameForBase = ghRepoEnvVar;
      }
    }
    const base = `/${repositoryNameForBase}/`;

    return {
      base: base,
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      plugins: [
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2,webmanifest}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/esm\.sh\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'esm-sh-cache',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'cdnjs-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'google-fonts-stylesheets',
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-webfonts',
                  expiration: {
                    maxEntries: 30,
                    maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
            ],
          },
          manifest: {
            name: 'AudioWrite',
            short_name: 'AudioWrite',
            description: 'AudioWrite: Effortless voice dictation powered by Google\'s Gemini API. Record, transcribe, and transform rambling audio into polished, multi-language notes. PWA ready.',
            theme_color: '#1E1E1E',
            background_color: '#121212',
            display: 'standalone',
            // Scope and start_url will be derived from Vite's base config by the plugin
            icons: [
              {
                src: 'icons/icon-192x192.png', // Relative to public folder
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable'
              },
              {
                src: 'icons/icon-512x512.png', // Relative to public folder
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              },
              // You can add more icon sizes here if needed for the manifest
              {
                src: 'icons/apple-touch-icon.png', // Example, if you want it in manifest
                sizes: '180x180',
                type: 'image/png',
                purpose: 'any'
              }
            ]
          }
        })
      ]
    };
});