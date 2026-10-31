import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy migrations into dist/db/migrations
const migrationsSrc = path.join(apiRoot, 'src', 'db', 'migrations');
const migrationsDest = path.join(apiRoot, 'dist', 'db', 'migrations');
copyDirRecursive(migrationsSrc, migrationsDest);

// 2. Copy assets into dist/assets
const assetsSrc = path.join(apiRoot, 'assets');
const assetsDest = path.join(apiRoot, 'dist', 'assets');
copyDirRecursive(assetsSrc, assetsDest);

// 3. Fix relative imports in dist for Node ESM
function fixEsmImports(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixEsmImports(fullPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const fileDir = path.dirname(fullPath);

      content = content.replace(/(from\s+['"]|import\(['"])(\.[^'"]+)(['"]\)?)/g, (full, prefix, spec, suffix) => {
        if (spec.endsWith('.js') || spec.endsWith('.json') || spec.endsWith('.mjs')) {
          return full;
        }
        const resolvedPath = path.resolve(fileDir, spec);
        if (fs.existsSync(resolvedPath + '.js')) {
          return `${prefix}${spec}.js${suffix}`;
        }
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory() && fs.existsSync(path.join(resolvedPath, 'index.js'))) {
          return `${prefix}${spec}/index.js${suffix}`;
        }
        if (fs.existsSync(resolvedPath + '.d.ts')) {
          return `${prefix}${spec}.js${suffix}`;
        }
        return full;
      });

      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

const distDir = path.join(apiRoot, 'dist');
fixEsmImports(distDir);

console.log('✓ Successfully copied migrations and assets, and fixed ESM imports in dist.');
