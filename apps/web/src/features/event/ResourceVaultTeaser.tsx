import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Lock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResourceItem {
  id: string;
  title: string;
  fileType: string;
  sizeBytes?: number;
  url?: string;
  isUnlocked?: boolean;
}

export interface ResourceVaultTeaserProps {
  resources?: ResourceItem[];
  isCheckedIn?: boolean;
  className?: string;
}

export const ResourceVaultTeaser: React.FC<ResourceVaultTeaserProps> = ({
  resources = [
    { id: '1', title: 'Session Slide Deck & References', fileType: 'PDF', sizeBytes: 4200000 },
    { id: '2', title: 'Hackathon Starter Code Repository', fileType: 'ZIP', sizeBytes: 15400000 },
    { id: '3', title: 'Dataset & API Evaluation Keys', fileType: 'JSON', sizeBytes: 850000 },
  ],
  isCheckedIn = false,
  className,
}) => {
  return (
    <Card className={cn('border-border', className)} data-testid="resource-vault-teaser">
      <CardHeader className="p-6 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">Event Resource Vault</CardTitle>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            {resources.length} Assets
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Presentation decks, code repositories, datasets, and recordings curated by organizers.
        </p>
      </CardHeader>

      <CardContent className="p-6 pt-0 space-y-2.5">
        {resources.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3 truncate">
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                <p className="text-[11px] text-muted-foreground tnum">
                  {item.fileType} • {item.sizeBytes ? `${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : 'Cloud Asset'}
                </p>
              </div>
            </div>

            {isCheckedIn || item.isUnlocked ? (
              <a
                href={item.url || '#'}
                download
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline px-3 py-1.5 rounded-md hover:bg-primary/10"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </a>
            ) : (
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
                <Lock className="h-3.5 w-3.5" />
                <span>Unlocked on check-in</span>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
