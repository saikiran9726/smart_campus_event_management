import fs from 'node:fs';

const eventFile = 'apps/web/src/features/event/EventPage.tsx';
let content = fs.readFileSync(eventFile, 'utf8');

// Replace indigo references with primary / teal
content = content.replace(/text-indigo-500/g, 'text-teal-600 dark:text-teal-400');
content = content.replace(/bg-indigo-600 hover:bg-indigo-700/g, 'bg-teal-600 hover:bg-teal-700');

fs.writeFileSync(eventFile, content, 'utf8');
console.log('EventPage.tsx updated with token colors');
