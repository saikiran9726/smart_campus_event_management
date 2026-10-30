import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, ExternalLink, Code2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WinnerItem {
  rank: 1 | 2 | 3;
  teamName: string;
  projectTitle: string;
  abstract: string;
  demoUrl?: string | null;
  repoUrl?: string | null;
  members: string[];
  prize: string;
}

export interface WinnersPodiumProps {
  winners: WinnerItem[];
  className?: string;
}

export const WinnersPodium: React.FC<WinnersPodiumProps> = ({ winners, className }) => {
  if (!winners || winners.length === 0) return null;

  // Sort by rank: 1, 2, 3
  const sorted = [...winners].sort((a, b) => a.rank - b.rank);
  const first = sorted.find((w) => w.rank === 1);
  const second = sorted.find((w) => w.rank === 2);
  const third = sorted.find((w) => w.rank === 3);

  const renderWinnerCard = (winner: WinnerItem, isTop = false) => {
    const rankColors = {
      1: {
        border: 'border-amber-400 dark:border-amber-500 shadow-amber-500/10 shadow-lg',
        badge: 'bg-amber-400 text-slate-950',
        icon: Trophy,
        title: '1st Place Winner',
      },
      2: {
        border: 'border-slate-300 dark:border-slate-700',
        badge: 'bg-slate-300 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
        icon: Medal,
        title: '2nd Place',
      },
      3: {
        border: 'border-amber-700/60 dark:border-amber-800',
        badge: 'bg-amber-700 text-white',
        icon: Medal,
        title: '3rd Place',
      },
    }[winner.rank];

    const Icon = rankColors.icon;

    return (
      <Card
        key={winner.rank}
        data-testid={`winner-card-rank-${winner.rank}`}
        className={cn(
          'relative flex flex-col justify-between overflow-hidden border-2 bg-card transition-all duration-300 motion-safe:hover:-translate-y-1',
          rankColors.border,
          isTop && 'sm:-mt-4'
        )}
      >
        <CardHeader className="p-5 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider',
                rankColors.badge
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{rankColors.title}</span>
            </span>
            <span className="text-xs font-bold text-primary tnum">{winner.prize}</span>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {winner.teamName}
            </p>
            <h4 className="text-lg font-extrabold tracking-tight text-foreground line-clamp-1">
              {winner.projectTitle}
            </h4>
          </div>
        </CardHeader>

        <CardContent className="p-5 pt-0 space-y-4">
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {winner.abstract}
          </p>

          {/* Member tags */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {winner.members.map((m, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-foreground"
              >
                {m}
              </span>
            ))}
          </div>

          {/* Demo & Repo Links */}
          <div className="flex items-center gap-3 pt-2 border-t border-border/50">
            {winner.demoUrl && (
              <a
                href={winner.demoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Live Demo</span>
              </a>
            )}
            {winner.repoUrl && (
              <a
                href={winner.repoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Source Code</span>
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={cn('space-y-6', className)} data-testid="winners-podium">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <h3 className="text-2xl font-extrabold tracking-tight">Winners Podium</h3>
      </div>

      {/* 2nd, 1st, 3rd Podium Layout on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
        {second && renderWinnerCard(second, false)}
        {first && renderWinnerCard(first, true)}
        {third && renderWinnerCard(third, false)}
      </div>
    </div>
  );
};
