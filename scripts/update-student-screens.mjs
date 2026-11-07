import fs from 'node:fs';
import path from 'node:path';

// 1. UPDATE NotificationBell.tsx
const notifBellPath = 'apps/web/src/components/notifications/NotificationBell.tsx';
let notifContent = fs.readFileSync(notifBellPath, 'utf8');

// Insert grouping helper and update rendering
const groupingCode = `
  const groupNotifications = (items: InAppNotification[]) => {
    const today: InAppNotification[] = [];
    const yesterday: InAppNotification[] = [];
    const older: InAppNotification[] = [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;

    for (const item of items) {
      const timeVal = new Date(item.runAt || item.sentAt || item.payload?.createdAt || Date.now()).getTime();
      if (timeVal >= startOfToday) {
        today.push(item);
      } else if (timeVal >= startOfYesterday) {
        yesterday.push(item);
      } else {
        older.push(item);
      }
    }
    return [
      { label: 'Today', items: today },
      { label: 'Yesterday', items: yesterday },
      { label: 'Older', items: older },
    ].filter((g) => g.items.length > 0);
  };
`;

// Replace list rendering in NotificationBell.tsx
const oldListPattern = /{filteredNotifications\.map\(\(item\) => {[\s\S]*?}\)\)}/;
const newListCode = `{groupNotifications(filteredNotifications).map((group) => (
              <div key={group.label} className="space-y-0.5">
                <div className="px-3.5 py-1.5 bg-stone-100/70 dark:bg-stone-800/60 text-[11px] font-bold text-stone-500 uppercase tracking-wider border-y border-stone-200/50 dark:border-stone-700/50">
                  {group.label} ({group.items.length})
                </div>
                {group.items.map((item) => {
                  const isUnread = item.status !== 'READ' && !item.payload?.read;
                  const title = item.payload?.title || item.eventTitle || 'Campus Notice';
                  const message = item.payload?.message || '';
                  const timeStr = formatRelativeTime(item.runAt || item.sentAt || undefined);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={cn(
                        'flex items-start gap-3 p-3 text-left cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/60',
                        isUnread && 'bg-teal-500/5'
                      )}
                    >
                      <div className="mt-0.5 p-1.5 rounded-lg bg-background border border-border shadow-xs shrink-0">
                        {getKindIcon(item.kind)}
                      </div>

                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('text-xs font-semibold truncate', isUnread ? 'text-foreground' : 'text-stone-600 dark:text-stone-400')}>
                            {title}
                          </p>
                          <span className="text-[10px] text-stone-400 font-mono shrink-0">
                            {timeStr}
                          </span>
                        </div>
                        {message && (
                          <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2">
                            {message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}`;

if (!notifContent.includes('groupNotifications')) {
  notifContent = notifContent.replace('const filteredNotifications =', `${groupingCode}\n  const filteredNotifications =`);
  notifContent = notifContent.replace(oldListPattern, newListCode);
  fs.writeFileSync(notifBellPath, notifContent, 'utf8');
  console.log('Updated NotificationBell.tsx with day grouping');
} else {
  console.log('NotificationBell.tsx already has groupNotifications');
}
