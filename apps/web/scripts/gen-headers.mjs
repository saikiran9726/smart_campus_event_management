import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

const apiUrl = process.env.VITE_API_URL || 'http://localhost:4000';
let apiOrigin = apiUrl;
let wsOrigin = 'ws://localhost:4000';

try {
  const parsed = new URL(apiUrl);
  apiOrigin = parsed.origin;
  const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  wsOrigin = `${wsProto}//${parsed.host}`;
} catch {
  // fallback to raw string
}

const r2BaseUrl = process.env.R2_PUBLIC_BASE_URL || 'https://assets.eventora.campus.edu';

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.clerk.accounts.dev https://clerk.eventora.campus.edu https://*.clerk.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${r2BaseUrl} https://img.clerk.com https://images.clerk.dev https://*.r2.cloudflarestorage.com https://*.supabase.co https://*.storage.supabase.co`,
  `connect-src 'self' ${apiOrigin} ${wsOrigin} https://challenges.cloudflare.com https://*.clerk.accounts.dev https://*.clerk.com https://*.supabase.co https://*.storage.supabase.co https://*.r2.cloudflarestorage.com`,
  "frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev https://*.clerk.com",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const headersContent = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), geolocation=()
  X-Frame-Options: DENY
  Content-Security-Policy: ${csp}
`;

const destPath = path.join(webRoot, 'public', '_headers');
fs.writeFileSync(destPath, headersContent, 'utf8');
console.log(`✓ Cloudflare Pages security headers generated at ${destPath}`);
