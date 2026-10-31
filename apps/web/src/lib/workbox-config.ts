export const workboxConfig = {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  navigateFallback: '/offline.html',
  navigateFallbackDenylist: [/^\/api/],
  runtimeCaching: [
    {
      urlPattern: ({ url, request }: { url: URL; request: Request }) =>
        request.method === 'GET' &&
        url.pathname.includes('/events') &&
        !url.pathname.includes('/gate') &&
        !url.pathname.includes('/scan') &&
        !url.pathname.includes('/scanner') &&
        !/\/tickets\/.*\/qr/.test(url.pathname) &&
        !request.headers.get('Authorization'),
      handler: 'StaleWhileRevalidate' as const,
      options: {
        cacheName: 'events-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24,
        },
      },
    },
    {
      urlPattern: ({ url, request }: { url: URL; request: Request }) =>
        url.pathname.includes('/gate') ||
        url.pathname.includes('/scan') ||
        url.pathname.includes('/scanner') ||
        /\/tickets\/.*\/qr/.test(url.pathname) ||
        Boolean(request.headers.get('Authorization')),
      handler: 'NetworkOnly' as const,
    },
  ],
};
