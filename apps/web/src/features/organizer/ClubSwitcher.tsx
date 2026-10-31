import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useActiveClub } from './ActiveClubContext';
import { CreateClubDialog } from './CreateClubDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Users } from 'lucide-react';

export const ClubSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { user } = useAuth();
  const { clubs, activeClubId, setActiveClubId, isLoading } = useActiveClub();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const canCreate = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  if (isLoading) {
    return (
      <div className="h-10 w-56 rounded-md bg-muted/40 animate-pulse border border-border" />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-56">
        <Select
          value={activeClubId || ''}
          onValueChange={(val) => {
            if (val) setActiveClubId(val);
          }}
          disabled={clubs.length === 0}
        >
          <SelectTrigger data-testid="club-switcher" className={className}>
            <SelectValue placeholder={clubs.length === 0 ? 'No clubs joined' : 'Select Club'} />
          </SelectTrigger>
          <SelectContent>
            {clubs.map((club) => (
              <SelectItem key={club.id} value={club.id} data-testid={`club-option-${club.id}`}>
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="truncate">{club.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono px-1 py-0.5 rounded bg-muted">
                    {club.role}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canCreate && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreateOpen(true)}
            data-testid="create-club-button"
            className="h-10 px-3 gap-1.5 text-xs font-semibold shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Club</span>
          </Button>

          <CreateClubDialog
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
          />
        </>
      )}
    </div>
  );
};
