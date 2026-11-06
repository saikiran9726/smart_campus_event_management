import fs from 'node:fs';

// 1. DiscoveryPage.tsx
const discPath = 'apps/web/src/features/discovery/DiscoveryPage.tsx';
let disc = fs.readFileSync(discPath, 'utf8');
disc = disc.replace('title="No Events Found"', 'title="No Campus Events Found"');
fs.writeFileSync(discPath, disc, 'utf8');
console.log('DiscoveryPage.tsx empty state title updated');

// 2. PassportPage.tsx
const passPath = 'apps/web/src/features/passport/PassportPage.tsx';
let pass = fs.readFileSync(passPath, 'utf8');
pass = pass.replace('<span>Passes ({upcomingTickets.length})</span>', '<span>Upcoming ({upcomingTickets.length})</span>');
pass = pass.replace('<span>Certs ({certificates.length})</span>', '<span>Certificates ({certificates.length})</span>');
fs.writeFileSync(passPath, pass, 'utf8');
console.log('PassportPage.tsx tab labels updated');
