import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Ensure YOU_REPOSITORY_NAME is replaced with your actual GitHub repository name
    // For example, if your repo URL is https://github.com/your-username/audiowrite-app,
    // then base should be '/audiowrite-app/'
    const repositoryName = process.env.AudioWrite || 'AudioWrite'; // Placeholder

    return {
      base: `/${repositoryName}/`, // Crucial for GitHub Pages
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});