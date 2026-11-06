import fs from 'node:fs';

// 1. NotificationBell.tsx - wrap in fallback QueryClientProvider
const notifPath = 'apps/web/src/components/notifications/NotificationBell.tsx';
let notif = fs.readFileSync(notifPath, 'utf8');

if (!notif.includes('NotificationBellInner')) {
  notif = notif.replace(
    "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';",
    "import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';"
  );
  notif = notif.replace(
    'export const NotificationBell: React.FC = () => {',
    `const fallbackQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export const NotificationBellInner: React.FC = () => {`
  );
  notif += `
export const NotificationBell: React.FC = (props) => {
  let hasClient = false;
  try {
    hasClient = !!useQueryClient();
  } catch {
    hasClient = false;
  }

  if (!hasClient) {
    return (
      <QueryClientProvider client={fallbackQueryClient}>
        <NotificationBellInner {...props} />
      </QueryClientProvider>
    );
  }

  return <NotificationBellInner {...props} />;
};
`;
  fs.writeFileSync(notifPath, notif, 'utf8');
  console.log('NotificationBell.tsx safely wrapped with fallback QueryClientProvider');
}

// 2. PassportPage.tsx - update empty state message
const passPath = 'apps/web/src/features/passport/PassportPage.tsx';
let pass = fs.readFileSync(passPath, 'utf8');

pass = pass.replace(
  `description="You don't have any confirmed registrations for upcoming events. Browse campus workshops and hackathons to get your pass."`,
  `description="You have no active upcoming event passes. Browse campus workshops and hackathons to get your pass."`
);

fs.writeFileSync(passPath, pass, 'utf8');
console.log('PassportPage.tsx empty state text updated');
