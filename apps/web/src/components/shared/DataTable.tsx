import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from './Card';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  className?: string;
  emptyText?: string;
  onRowClick?: (item: T) => void;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  className,
  emptyText = 'No records found.',
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (colId: string) => {
    if (sortKey === colId) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(colId);
      setSortDir('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.id === sortKey);
    if (!col) return data;

    return [...data].sort((a, b) => {
      const valA = col.accessorKey ? a[col.accessorKey] : '';
      const valB = col.accessorKey ? b[col.accessorKey] : '';
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sortDir === 'asc' ? res : -res;
    });
  }, [data, sortKey, sortDir, columns]);

  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-stone-500 rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50/50">
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn('w-full space-y-3', className)}>
      {/* 1. Desktop & Tablet View (>= 768px): HTML Table */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 shadow-sm">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/75 dark:border-stone-800 dark:bg-stone-900/80">
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  onClick={() => col.sortable && handleSort(col.id)}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300',
                    col.sortable && 'cursor-pointer select-none hover:text-stone-900 dark:hover:text-stone-100',
                    col.className
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-stone-400">
                        {sortKey === col.id ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5 stroke-[2]" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 stroke-[2]" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 stroke-[1.75]" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
            {sortedData.map((item) => {
              const rowKey = keyExtractor(item);
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'transition-colors hover:bg-stone-50/80 dark:hover:bg-stone-800/40',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.id} className={cn('px-4 py-3 text-sm text-stone-800 dark:text-stone-200', col.className)}>
                      {col.cell ? col.cell(item) : col.accessorKey ? String(item[col.accessorKey] ?? '') : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. Mobile View (< 768px): Responsive Cards */}
      <div className="block md:hidden space-y-3">
        {sortedData.map((item) => {
          const rowKey = keyExtractor(item);
          return (
            <Card
              key={rowKey}
              onClick={() => onRowClick?.(item)}
              className={cn('p-4 space-y-2.5', onRowClick && 'cursor-pointer active:scale-[0.99]')}
            >
              {columns.map((col) => (
                <div key={col.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="font-semibold text-stone-500 uppercase tracking-wide shrink-0">
                    {col.header}:
                  </span>
                  <div className="text-right text-stone-800 dark:text-stone-200 font-medium break-words">
                    {col.cell ? col.cell(item) : col.accessorKey ? String(item[col.accessorKey] ?? '') : null}
                  </div>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
DataTable.displayName = 'DataTable';
