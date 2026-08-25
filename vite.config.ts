import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';

function normalizeSiteUrl(value?: string) {
  const siteUrl = value?.trim().split(/[?#]/, 1)[0];
  if (!siteUrl || !/^https?:\/\/\S+$/i.test(siteUrl)) return '/';
  return siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
}

function seoHtmlPlugin(siteUrl: string): Plugin {
  const socialImageUrl =
    siteUrl === '/' ? '/og-image.png' : `${siteUrl}og-image.png`;

  return {
    name: 'seo-html',
    transformIndexHtml(html) {
      return html
        .replaceAll('__SITE_URL__', siteUrl)
        .replaceAll('__SOCIAL_IMAGE_URL__', socialImageUrl);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const siteUrl = normalizeSiteUrl(
    env.VITE_SITE_URL || env.VITE_SPOTIFY_REDIRECT_URI,
  );

  return {
    plugins: [react(), seoHtmlPlugin(siteUrl)],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
