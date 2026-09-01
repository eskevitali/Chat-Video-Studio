import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {elevenLabsTtsPlugin} from './vite.tts-plugin.mjs';

export default defineConfig(({mode}) => {
  const environment = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), elevenLabsTtsPlugin(environment)],
    server: {port: 4173, host: '127.0.0.1'},
  };
});
