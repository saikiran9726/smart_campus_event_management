import fs from 'node:fs';

const volPath = 'apps/web/src/features/volunteer/VolunteerDashboardPage.tsx';
let content = fs.readFileSync(volPath, 'utf8');

content = content.replace(/text-indigo-500/g, 'text-teal-600 dark:text-teal-400');
content = content.replace(/text-indigo-600/g, 'text-teal-600 dark:text-teal-400');
content = content.replace(/bg-indigo-600 hover:bg-indigo-700/g, 'bg-teal-600 hover:bg-teal-700');
content = content.replace(/bg-gradient-to-r from-muted\/30 to-background/g, 'bg-stone-50/70 dark:bg-stone-900/40');

fs.writeFileSync(volPath, content, 'utf8');
console.log('VolunteerDashboardPage.tsx updated with token colors');
