import fs from 'node:fs';

const shellPath = 'apps/web/src/components/layout/app-shell.tsx';
let shell = fs.readFileSync(shellPath, 'utf8');

const targetSection = `        {/* 3. Mobile Bottom Navigation (Visible on mobile for student navigation) */}
        {isStudentOnly && (
          <nav
            aria-label="Mobile Bottom Navigation"
            className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-white/95 dark:bg-stone-900/95 pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
          >
            <div className="flex h-16 items-center justify-around px-1">
              {studentMobileBottomNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = isRouteActive(item.path);

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex flex-col items-center justify-center flex-1 h-full min-h-[48px] py-1 text-xs font-medium transition-colors focus-ring',
                      isActive ? 'text-teal-700 dark:text-teal-400 font-bold' : 'text-stone-500 hover:text-stone-900 dark:text-stone-400'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 mb-0.5 stroke-[1.75]', isActive && 'stroke-[2.2]')} />
                    <span className="text-[10px] sm:text-[11px] leading-tight text-center truncate max-w-[64px]">
                      {item.label}
                    </span>
                  </NavLink>
                );
            })}
          </div>
        </nav>`;

const replacementSection = `        {/* 3. Mobile Bottom Navigation */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-white/95 dark:bg-stone-900/95 pb-[env(safe-area-inset-bottom,0px)] shadow-lg"
        >
          <div className="flex h-16 items-center justify-around px-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = isRouteActive(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex flex-col items-center justify-center flex-1 h-full min-h-[48px] py-1 text-xs font-medium transition-colors focus-ring',
                    isActive ? 'text-teal-700 dark:text-teal-400 font-bold' : 'text-stone-500 hover:text-stone-900 dark:text-stone-400'
                  )}
                >
                  <Icon className={cn('h-5 w-5 mb-0.5 stroke-[1.75]', isActive && 'stroke-[2.2]')} />
                  <span className="text-[10px] sm:text-[11px] leading-tight text-center truncate max-w-[64px]">
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        </nav>`;

shell = shell.replace(targetSection, replacementSection);
fs.writeFileSync(shellPath, shell, 'utf8');
console.log('Cleanly replaced mobile nav');
