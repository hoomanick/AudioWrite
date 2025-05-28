import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Robustly determine repository name for GitHub Pages base path
    // Handles cases where GITHUB_REPOSITORY_NAME might be 'owner/repo', just 'repo', or undefined.
    const ghRepoEnvVar = process.env.GITHUB_REPOSITORY_NAME;
    let repositoryNameForBase = 'AudioWrite'; // Default repository name

    if (ghRepoEnvVar) {
      if (ghRepoEnvVar.includes('/')) {
        repositoryNameForBase = ghRepoEnvVar.split('/').pop() || 'AudioWrite';
      } else {
        repositoryNameForBase = ghRepoEnvVar;
      }
    }
    
    return {
      base: `/${repositoryNameForBase}/`, // Crucial for GitHub Pages
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