import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Recursive file scanner
function scanDir(dir, predicate) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath, predicate));
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

const isNonTestWebSource = (file) => {
  const rel = path.relative(rootDir, file).replace(/\\/g, '/');
  return (
    rel.startsWith('apps/web/src/') &&
    (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) &&
    !file.includes('__tests__') &&
    !file.includes('.test.') &&
    !file.includes('.spec.')
  );
};

const isApiSource = (file) => {
  const rel = path.relative(rootDir, file).replace(/\\/g, '/');
  return (
    rel.startsWith('apps/api/src/') &&
    (file.endsWith('.ts') || file.endsWith('.js')) &&
    !file.includes('__tests__') &&
    !file.includes('.test.') &&
    !file.includes('.spec.')
  );
};

// 2. Normalise URL template
function normalizeUrl(rawUrl) {
  let url = rawUrl.trim();
  // Strip surrounding quotes or backticks
  if ((url.startsWith('"') && url.endsWith('"')) ||
      (url.startsWith("'") && url.endsWith("'")) ||
      (url.startsWith('`') && url.endsWith('`'))) {
    url = url.slice(1, -1);
  }

  // Remove full domain or env variable prefixes
  url = url.replace(/^\$\{env\.VITE_API_URL\}/, '');
  url = url.replace(/^http:\/\/localhost:\d+/, '');
  url = url.replace(/^https?:\/\/[^/]+/, '');

  // Strip query string and hash
  url = url.split('?')[0].split('#')[0];

  // Replace template literals: ${...} -> :param
  url = url.replace(/\$\{[^}]+\}/g, ':param');

  // Replace duplicate slashes
  url = url.replace(/\/+/g, '/');

  // Strip trailing slash unless it's root
  if (url.length > 1 && url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  return url;
}

// 3. Extract web API calls & Socket events
const webFiles = scanDir(path.join(rootDir, 'apps/web/src'), isNonTestWebSource);

const webApiCalls = [];
const webSocketListens = new Set();
const webSocketEmits = new Set();

const apiCallRegex = /api\.(get|post|put|patch|delete|getBlob)\s*(?:<[^>]*>)?\s*\(\s*([`'"][^`'"]+[`'"])/g;
const windowOpenRegex = /window\.open\s*\(\s*([`'"][^`'"]+[`'"])/g;
const fetchRegex = /fetch\s*\(\s*([`'"][^`'"]+[`'"])/g;

const socketOnRegex = /socket\.on\s*\(\s*['"]([^'"]+)['"]/g;
const useSocketEventRegex = /useSocketEvent\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g;
const socketEmitRegex = /socket\.emit\s*\(\s*['"]([^'"]+)['"]/g;

for (const file of webFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

  // api.<method>(url)
  let match;
  while ((match = apiCallRegex.exec(content)) !== null) {
    const rawMethod = match[1];
    const method = rawMethod === 'getBlob' ? 'GET' : rawMethod.toUpperCase();
    const rawUrl = match[2];
    const normalized = normalizeUrl(rawUrl);
    if (normalized.startsWith('/')) {
      webApiCalls.push({ method, url: normalized, raw: rawUrl, file: relPath });
    }
  }

  // window.open(url) -> typically GET for downloads/reports
  while ((match = windowOpenRegex.exec(content)) !== null) {
    const rawUrl = match[1];
    const normalized = normalizeUrl(rawUrl);
    if (normalized.startsWith('/') && !normalized.startsWith('/faculty/decision') && !normalized.startsWith('/organizer')) {
      webApiCalls.push({ method: 'GET', url: normalized, raw: rawUrl, file: relPath });
    }
  }

  // fetch(url)
  while ((match = fetchRegex.exec(content)) !== null) {
    const rawUrl = match[1];
    const normalized = normalizeUrl(rawUrl);
    if (normalized.startsWith('/') || rawUrl.includes('VITE_API_URL')) {
      webApiCalls.push({ method: 'GET', url: normalized, raw: rawUrl, file: relPath });
    }
  }

  // Sockets listened to
  while ((match = socketOnRegex.exec(content)) !== null) {
    webSocketListens.add(match[1]);
  }
  while ((match = useSocketEventRegex.exec(content)) !== null) {
    webSocketListens.add(match[1]);
  }

  // Sockets emitted
  while ((match = socketEmitRegex.exec(content)) !== null) {
    webSocketEmits.add(match[1]);
  }
}

// 4. Extract backend Socket events
const apiFiles = scanDir(path.join(rootDir, 'apps/api/src'), isApiSource);
const backendSocketEmits = new Set();
const backendSocketListens = new Set();

const backendEmitRegex = /(?:io|socket|ioInstance)[^;]*?\.emit\s*\(\s*['"]([^'"]+)['"]/g;
const backendOnRegex = /socket\.on\s*\(\s*['"]([^'"]+)['"]/g;

for (const file of apiFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = backendEmitRegex.exec(content)) !== null) {
    backendSocketEmits.add(match[1]);
  }
  while ((match = backendOnRegex.exec(content)) !== null) {
    backendSocketListens.add(match[1]);
  }
}

// 5. Load and audit against Fastify buildServer
async function runAudit() {
  console.log('='.repeat(80));
  console.log('EVENTORA ROUTE & REALTIME AUDIT (Prompt 25 Phase 1)');
  console.log('='.repeat(80));

  let serverModule;
  try {
    serverModule = await import('../apps/api/dist/server.js');
  } catch (err) {
    console.error('Failed to import apps/api/dist/server.js. Run "pnpm -r build" first.');
    console.error(err);
    process.exit(1);
  }

  const { buildServer } = serverModule;
  const server = await buildServer({ logger: false });
  await server.ready();

  const missingRoutes = [];
  const uniqueApiCalls = new Map();

  for (const call of webApiCalls) {
    const key = `${call.method} ${call.url}`;
    if (!uniqueApiCalls.has(key)) {
      uniqueApiCalls.set(key, []);
    }
    uniqueApiCalls.get(key).push(call.file);
  }

  for (const [key, files] of uniqueApiCalls.entries()) {
    const [method, url] = key.split(' ');
    // Fastify hasRoute tests if find-my-way router can dispatch this route
    const exists = server.hasRoute({ method, url });
    if (!exists) {
      missingRoutes.push({ method, url, callers: files });
    }
  }

  // Check socket event parity
  const missingBackendListeners = [];
  for (const event of webSocketEmits) {
    if (!backendSocketListens.has(event)) {
      missingBackendListeners.push(event);
    }
  }

  // System/transport level socket events that do not require explicit application listeners
  const ignoredBackendEvents = new Set(['error', 'joined:channel']);
  const missingWebListeners = [];
  for (const event of backendSocketEmits) {
    if (ignoredBackendEvents.has(event)) continue;
    if (!webSocketListens.has(event)) {
      missingWebListeners.push(event);
    }
  }

  console.log(`Audited Web Endpoints: ${uniqueApiCalls.size} unique (${webApiCalls.length} total call sites)`);
  console.log(`Audited Socket Events: ${webSocketListens.size} web listeners, ${backendSocketEmits.size} backend emitters\n`);

  let hasErrors = false;

  if (missingRoutes.length > 0) {
    hasErrors = true;
    console.error(`❌ MISSING BACKEND ROUTES (${missingRoutes.length} found):`);
    for (const r of missingRoutes) {
      console.error(`   ${r.method.padEnd(7)} ${r.url}`);
      console.error(`           Callers: ${r.callers.slice(0, 3).join(', ')}`);
    }
    console.error('');
  } else {
    console.log('✅ All web API routes are registered and handled in Fastify backend.');
  }

  if (missingBackendListeners.length > 0) {
    hasErrors = true;
    console.error(`❌ SOCKET EVENTS EMITTED BY WEB BUT NOT LISTENED TO BY BACKEND (${missingBackendListeners.length}):`);
    for (const ev of missingBackendListeners) {
      console.error(`   - ${ev}`);
    }
    console.error('');
  } else {
    console.log('✅ All socket events emitted by frontend are handled by backend.');
  }

  if (missingWebListeners.length > 0) {
    hasErrors = true;
    console.error(`❌ SOCKET EVENTS EMITTED BY BACKEND BUT NOT LISTENED TO BY WEB (${missingWebListeners.length}):`);
    for (const ev of missingWebListeners) {
      console.error(`   - ${ev}`);
    }
    console.error('');
  } else {
    console.log('✅ All socket events emitted by backend are handled by frontend.');
  }

  console.log('='.repeat(80));

  await server.close();

  if (hasErrors) {
    console.error('Audit failed with mismatches. Please fix before proceeding.');
    process.exit(1);
  } else {
    console.log('AUDIT PASSED: Zero route and event mismatches.');
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
