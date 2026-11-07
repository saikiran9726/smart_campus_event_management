import fs from 'node:fs';

const adminPath = 'apps/web/src/routes/admin.tsx';
let content = fs.readFileSync(adminPath, 'utf8');

content = content.replace(/text-indigo-500/g, 'text-teal-600 dark:text-teal-400');
content = content.replace(/text-indigo-600 dark:text-indigo-400/g, 'text-teal-600 dark:text-teal-400');
content = content.replace(/bg-indigo-600 hover:bg-indigo-700/g, 'bg-teal-600 hover:bg-teal-700');

fs.writeFileSync(adminPath, content, 'utf8');
console.log('admin.tsx updated with token colors');
