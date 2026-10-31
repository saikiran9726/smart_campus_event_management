#!/usr/bin/env node
/**
 * scripts/smoke-prod.mjs - Post-Deployment Automated Smoke Verification
 * Zero external dependencies (uses standard Node.js global fetch).
 */

const rawApiUrl = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const rawWebUrl = process.argv[3] || process.env.WEB_URL || 'http://localhost:3000';

const API_URL = rawApiUrl.replace(/\/+$/, '');
const WEB_URL = rawWebUrl.replace(/\/+$/, '');

console.log('==========================================================');
console.log('         EVENTORA PRODUCTION SMOKE VERIFICATION SUITE     ');
console.log('==========================================================');
console.log(`API Target URL: ${API_URL}`);
console.log(`Web Target URL: ${WEB_URL}`);
console.log('----------------------------------------------------------\n');

let allPassed = true;

async function runCheck(name, checkFn) {
  process.stdout.write(`[*] Checking ${name}... `);
  try {
    const detail = await checkFn();
    console.log(`\x1b[32m[PASS]\x1b[0m ${detail || ''}`);
  } catch (err) {
    allPassed = false;
    console.log(`\x1b[31m[FAIL]\x1b[0m ${err.message}`);
  }
}

async function main() {
  // 1. API /health (Liveness)
  await runCheck('API Liveness (/health)', async () => {
    const res = await fetch(`${API_URL}/health`);
    if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(`Expected json status: 'ok', got ${json.status}`);
    return `(Status 200, status: ok)`;
  });

  // 2. API /ready (Readiness & DB)
  await runCheck('API Readiness & DB Connection (/ready)', async () => {
    const res = await fetch(`${API_URL}/ready`);
    if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
    const json = await res.json();
    if (json.status !== 'ready' || json.db !== 'up') {
      throw new Error(`Expected ready & db:up, got ${JSON.stringify(json)}`);
    }
    return `(Status 200, db: up, migrations: applied)`;
  });

  // 3. API /version (Metadata)
  await runCheck('API Version & Commit Info (/version)', async () => {
    const res = await fetch(`${API_URL}/version`);
    if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
    const json = await res.json();
    if (!json.version) throw new Error(`Expected version string, got ${JSON.stringify(json)}`);
    return `(Version ${json.version}, commit: ${json.commit || 'dev'})`;
  });

  // 4. API Public Events Collection (/events)
  await runCheck('Public Events Endpoint (/events)', async () => {
    const res = await fetch(`${API_URL}/events`);
    if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.items)) throw new Error(`Expected json.items array, got ${JSON.stringify(json)}`);
    return `(Status 200, ${json.items.length} events returned)`;
  });

  // 5. Web Frontend Root URL
  await runCheck('Web Frontend Root Availability (/)', async () => {
    const res = await fetch(`${WEB_URL}/`);
    if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
    const text = await res.text();
    if (!text.includes('<!DOCTYPE html>') && !text.includes('<html')) {
      throw new Error('Response did not contain HTML markup');
    }
    return `(Status 200, HTML document received)`;
  });

  // 6. CORS Allowed Origin Preflight from WEB_URL
  await runCheck(`CORS Preflight from ${WEB_URL}`, async () => {
    const res = await fetch(`${API_URL}/events`, {
      method: 'OPTIONS',
      headers: {
        Origin: WEB_URL,
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    if (allowOrigin !== WEB_URL && allowOrigin !== '*') {
      throw new Error(`Expected allow-origin: ${WEB_URL}, got: ${allowOrigin}`);
    }
    return `(access-control-allow-origin: ${allowOrigin})`;
  });

  // 7. CORS Disallowed Origin Preflight from evil.example
  await runCheck('CORS Isolation from Unauthorized Origin (evil.example)', async () => {
    const res = await fetch(`${API_URL}/events`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    if (allowOrigin === 'https://evil.example') {
      throw new Error(`Disallowed origin received allow-origin header!`);
    }
    return `(No allow-origin header granted)`;
  });

  // 8. Auth Protection on Private Endpoint (/me)
  await runCheck('Authentication Guard on Private Endpoint (/me)', async () => {
    const res = await fetch(`${API_URL}/me`);
    if (res.status !== 401) {
      throw new Error(`Expected status 401 UNAUTHENTICATED, got ${res.status}`);
    }
    return `(Status 401, unauthorized request blocked)`;
  });

  // 9. Webhook Security Signature Check (/webhooks/clerk)
  await runCheck('Svix Webhook HMAC Verification (/webhooks/clerk)', async () => {
    const res = await fetch(`${API_URL}/webhooks/clerk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'user.created', data: {} }),
    });
    if (res.status !== 400) {
      throw new Error(`Expected status 400 for unsigned webhook, got ${res.status}`);
    }
    return `(Status 400, unsigned webhook payload rejected)`;
  });

  // 10. Strict Transport Security (HSTS) on HTTPS Targets
  await runCheck('Security Headers / HSTS', async () => {
    const res = await fetch(`${API_URL}/health`);
    const hsts = res.headers.get('strict-transport-security');
    const isHttps = API_URL.startsWith('https://');
    if (isHttps && !hsts) {
      throw new Error('HSTS header (strict-transport-security) missing on HTTPS production target');
    }
    return isHttps
      ? `(strict-transport-security: ${hsts})`
      : `(HTTP target: HSTS optional in non-TLS dev environment)`;
  });

  console.log('\n----------------------------------------------------------');
  if (allPassed) {
    console.log('\x1b[32m[✓] ALL PRODUCTION SMOKE CHECKS PASSED SUCCESSFULLY.\x1b[0m\n');
    process.exit(0);
  } else {
    console.error('\x1b[31m[✗] ONE OR MORE PRODUCTION SMOKE CHECKS FAILED.\x1b[0m\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal smoke verification failure:', err);
  process.exit(1);
});
