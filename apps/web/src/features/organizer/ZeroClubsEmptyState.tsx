import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreateClubDialog } from './CreateClubDialog';
import { ShieldAlert, PlusCircle, RefreshCw } from 'lucide-react';

export const ZeroClubsEmptyState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const canCreate = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  return (
    <Card className="border-border shadow-sm max-w-xl mx-auto my-12" data-testid="zero-clubs-empty-state">
      <CardContent className="p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight">No Club Memberships Found</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You are not an owner or admin of any club yet. To manage campus events, team rosters, and gate scanners, create a new club or request ownership transfer.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {canCreate && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              data-testid="create-club-empty-trigger"
              className="gap-2 font-semibold shadow-sm w-full sm:w-auto"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Create Campus Club</span>
            </Button>
          )}
          {onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              data-testid="retry-clubs-button"
              className="gap-2 w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh Status</span>
            </Button>
          )}
        </div>

        {canCreate && (
          <CreateClubDialog
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
};
