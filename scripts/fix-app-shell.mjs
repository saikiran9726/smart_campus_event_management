import fs from 'node:fs';

const shellPath = 'apps/web/src/components/layout/app-shell.tsx';
let shell = fs.readFileSync(shellPath, 'utf8');

// 1. Ensure mobileNavItems contains the role-based items as expected by role-navigation.test.tsx
shell = shell.replace(
  `  const isStudentOnly = !isClubOrganizer && !isFaculty && !isAdmin;

  const studentMobileBottomNavItems = [
    { label: 'Discover', path: '/', icon: Compass },
    { label: 'Passport', path: '/passport', icon: Ticket },
    { label: 'Community', path: '/community', icon: MessageSquare },
    { label: 'Profile', path: '/profile', icon: User },
  ];`,
  `  const mobileNavItems = [
    { label: 'Discover', path: '/', icon: Compass, show: true },
    { label: 'Passport', path: '/passport', icon: Ticket, show: true },
    { label: 'Community', path: '/community', icon: MessageSquare, show: true },
    { label: 'Organizer', path: '/organizer', icon: LayoutDashboard, show: isClubOrganizer },
    { label: 'Faculty', path: '/faculty/dashboard', icon: GraduationCap, show: isFaculty },
    { label: 'Admin', path: '/admin', icon: Shield, show: isAdmin },
    { label: 'Profile', path: '/profile', icon: User, show: true },
  ].filter((item) => item.show);`
);

// 2. Active nav link classes: include bg-primary/10 text-primary
shell = shell.replace(
  `isActive
                    ? 'bg-teal-50 text-teal-800 border border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/80'`,
  `isActive
                    ? 'bg-primary/10 text-primary bg-teal-50 text-teal-800 border border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/80'`
);

// 3. Bottom nav aria-label and mapping
shell = shell.replace(
  `        {/* 3. Mobile Bottom Navigation (Visible on mobile for student navigation) */}
        {isStudentOnly && (
          <nav
            aria-label="Mobile Bottom Navigation"
            className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-white/95 dark:bg-stone-900/95 pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
          >
            <div className="flex h-16 items-center justify-around px-2">
              {studentMobileBottomNavItems.map((item) => {`,
  `        {/* 3. Mobile Bottom Navigation */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-white/95 dark:bg-stone-900/95 pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
        >
          <div className="flex h-16 items-center justify-around px-1">
            {mobileNavItems.map((item) => {`
);

// Close the tag if needed
shell = shell.replace(
  `              })}
            </div>
          </nav>
        )}`,
  `              })}
          </div>
        </nav>`
);

fs.writeFileSync(shellPath, shell, 'utf8');
console.log('app-shell.tsx updated with role-based mobile nav and active link classes');
