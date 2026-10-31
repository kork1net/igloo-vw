import itemsPlugin from './items-plugin.mjs';
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    plugins: [itemsPlugin()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080
    }
});
