import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center select-none">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 mb-6 border border-indigo-500/20">
        <FileQuestion className="h-10 w-10 animate-pulse" />
      </div>

      <span className="text-xs font-bold tracking-widest text-indigo-500 uppercase">
        404 — Page Not Found
      </span>

      <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        This page could not be found
      </h1>

      <p className="mt-3 text-base text-slate-600 dark:text-slate-400 max-w-md">
        The link you followed may be broken, or the event or resource may have been removed.
      </p>

      <div className="mt-8 flex gap-4">
        <Link to="/">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
