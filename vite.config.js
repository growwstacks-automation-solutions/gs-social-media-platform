import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  const auth = privateKey
    ? 'Basic ' + Buffer.from(privateKey + ':').toString('base64')
    : null;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api/imagekit-upload': {
          target: 'https://upload.imagekit.io',
          changeOrigin: true,
          secure: true,
          rewrite: () => '/api/v1/files/upload',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (auth) proxyReq.setHeader('Authorization', auth);
            });
            proxy.on('error', (err) => {
              console.error('[imagekit-proxy] error:', err.message);
            });
          }
        }
      }
    }
  };
});
