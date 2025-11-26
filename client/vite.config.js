import { defineConfig } from 'vite';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
    base: '/CyberForensics-Arena/',
    plugins: [
        viteCompression({
            algorithm: 'gzip',
            ext: '.gz',
        })
    ],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
            output: {
                manualChunks: {
                    babylon: ['@babylonjs/core', '@babylonjs/loaders'],
                    xterm: ['xterm', 'xterm-addon-fit']
                }
            },
            input: {
                main: 'index.html',
                editor: 'editor.html'
            }
        }
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
})
