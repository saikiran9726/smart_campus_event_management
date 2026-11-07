import fs from 'node:fs';

const analyticsPath = 'apps/web/src/features/organizer/AnalyticsPage.tsx';
let content = fs.readFileSync(analyticsPath, 'utf8');

// Replace chart colors
content = content.replace(/fill="#4338CA"/g, 'fill="#0f766e"');
content = content.replace(/stroke="#6366F1"/g, 'stroke="#0d9488"');
content = content.replace(/fill="#818CF8"/g, 'fill="#a8a29e"');
content = content.replace(/bg-indigo-600/g, 'bg-teal-600');
content = content.replace(/text-indigo-600/g, 'text-teal-600');
content = content.replace(/text-indigo-500/g, 'text-teal-600');
content = content.replace(/bg-indigo-600 hover:bg-indigo-700/g, 'bg-teal-600 hover:bg-teal-700');

// Update Donut colors to teal / stone / amber
content = content.replace(
  "const DONUT_COLORS = ['#10B981', '#F43F5E', '#F59E0B'];",
  "const DONUT_COLORS = ['#0f766e', '#dc2626', '#d97706'];"
);

fs.writeFileSync(analyticsPath, content, 'utf8');
console.log('AnalyticsPage.tsx updated with teal/stone/amber palette');
