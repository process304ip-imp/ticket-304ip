import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  Object.assign(process.env, env);
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: '304IP CRM Ticket System',
          short_name: '304IP CRM',
          description: 'ระบบ Customer Complaint & Ticket สำหรับ 304 Industrial Park',
          theme_color: '#001e40',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
        devOptions: { enabled: true },
      }),
      {
        name: 'netlify-functions-emulator',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/.netlify/functions/')) {
              try {
                const urlParts = req.url.split('?');
                const pathParts = urlParts[0].split('/');
                const functionName = pathParts[pathParts.length - 1];

                let handlerModule: any = null;
                if (functionName === 'get-presigned-url') {
                  handlerModule = await server.ssrLoadModule('./netlify/functions/get-presigned-url.ts');
                } else if (functionName === 'upload-r2') {
                  handlerModule = await server.ssrLoadModule('./netlify/functions/upload-r2.ts');
                } else if (functionName === 'delete-r2') {
                  handlerModule = await server.ssrLoadModule('./netlify/functions/delete-r2.ts');
                }

                if (!handlerModule || !handlerModule.handler) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `Function ${functionName} not found` }));
                  return;
                }

                const bodyBuffers: Buffer[] = [];
                req.on('data', (chunk) => bodyBuffers.push(chunk));
                req.on('end', async () => {
                  try {
                    const rawBody = Buffer.concat(bodyBuffers);
                    const contentType = req.headers['content-type'] || '';
                    
                    // For multipart, use binary encoding to preserve raw bytes
                    const isMultipart = contentType.includes('multipart/form-data');
                    const bodyString = isMultipart 
                      ? rawBody.toString('binary') 
                      : rawBody.toString('utf8');

                    const queryParams: Record<string, string> = {};
                    if (urlParts.length > 1) {
                      const searchParams = new URLSearchParams(urlParts[1]);
                      searchParams.forEach((val, key) => { queryParams[key] = val; });
                    }

                    const eventHeaders: Record<string, string> = {};
                    Object.entries(req.headers).forEach(([key, val]) => {
                      if (val !== undefined) {
                        eventHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
                      }
                    });

                    const event = {
                      httpMethod: req.method || 'GET',
                      body: bodyString,
                      headers: eventHeaders,
                      queryStringParameters: queryParams,
                      isBase64Encoded: false,
                    };

                    const result = await handlerModule.handler(event, {});

                    res.statusCode = result.statusCode || 200;
                    if (result.headers) {
                      Object.entries(result.headers).forEach(([key, val]) => {
                        res.setHeader(key, val as string);
                      });
                    }
                    res.end(result.body || '');
                  } catch (err: any) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Emulator internal error', message: err.message }));
                  }
                });
                return;
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Failed to load function module', message: err.message }));
                return;
              }
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            supabase: ['@supabase/supabase-js'],
            maps: ['leaflet', 'react-leaflet'],
            motion: ['framer-motion', 'motion'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/idms': {
          target: 'http://mobiledev.advanceagro.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/idms/, '/ws/api/idms')
        },
        '/api/hrms': {
          target: 'http://api-idms.advanceagro.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/hrms/, '/hrms')
        }
      }
    },
  };
});
