import fs from 'node:fs';

const facultyDashPath = 'apps/web/src/features/faculty/FacultyDashboardPage.tsx';
let content = fs.readFileSync(facultyDashPath, 'utf8');

// Replace indigo colors with teal
content = content.replace(/text-indigo-600/g, 'text-teal-600 dark:text-teal-400');
content = content.replace(/bg-indigo-600 hover:bg-indigo-700/g, 'bg-teal-600 hover:bg-teal-700');

fs.writeFileSync(facultyDashPath, content, 'utf8');
console.log('FacultyDashboardPage.tsx updated with token colors');
