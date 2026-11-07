import fs from 'node:fs';

const shellPath = 'apps/web/src/components/layout/app-shell.tsx';
let shell = fs.readFileSync(shellPath, 'utf8');

shell = shell.replace(
  `isActive
                    ? 'bg-primary/10 text-primary bg-teal-50 text-teal-800 border border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/80'`,
  `isActive
                    ? 'border border-teal-200/80 dark:border-teal-800/80 bg-primary/10 text-primary'`
);

shell = shell.replace(
  `isActive
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'`,
  `isActive
                              ? 'bg-primary/10 text-primary'`
);

fs.writeFileSync(shellPath, shell, 'utf8');
console.log('Updated active classes to bg-primary/10 text-primary');
