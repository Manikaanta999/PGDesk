import React, { useMemo, useState } from 'react';
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pageSize?: number;
  toolbarExtra?: React.ReactNode;
  renderMobileCard?: (row: TData) => React.ReactNode;
}

export function DataTable<TData>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  emptyTitle = 'No records found',
  emptyDescription = 'Adjust your filters or add a new record to get started.',
  emptyAction,
  pageSize = 10,
  toolbarExtra,
  renderMobileCard,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [localSearch, setLocalSearch] = useState('');

  const effectiveSearch = searchValue !== undefined ? searchValue : localSearch;
  const handleSearch = (v: string) => {
    if (onSearchChange) onSearchChange(v);
    else setLocalSearch(v);
  };

  const filteredData = useMemo(() => {
    if (onSearchChange || !effectiveSearch.trim()) return data;
    const q = effectiveSearch.trim().toLowerCase();
    return data.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [data, effectiveSearch, onSearchChange]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={effectiveSearch}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-teal-500 dark:focus:bg-slate-950"
          />
        </div>
        {toolbarExtra && <div className="flex flex-wrap items-center gap-2">{toolbarExtra}</div>}
      </div>

      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{emptyTitle}</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{emptyDescription}</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      ) : (
        <>
          {renderMobileCard && (
            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              {table.getRowModel().rows.map((row) => (
                <div key={row.id} className="p-4">
                  {renderMobileCard(row.original)}
                </div>
              ))}
            </div>
          )}

          <div className={`overflow-x-auto ${renderMobileCard ? 'hidden md:block' : ''}`}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr
                    key={hg.id}
                    className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"
                  >
                    {hg.headers.map((header) => {
                      const stickyRight = Boolean((header.column.columnDef.meta as any)?.stickyRight);
                      return (
                        <th
                          key={header.id}
                          className={`whitespace-nowrap px-4 py-3 ${
                            stickyRight
                              ? 'md:sticky md:right-0 md:z-10 md:border-l md:border-slate-200 md:bg-slate-50 md:shadow-[-6px_0_12px_-6px_rgba(15,23,42,0.08)] dark:md:border-slate-800 dark:md:bg-slate-950'
                              : ''
                          }`}
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1.5 font-medium hover:text-slate-900 dark:hover:text-slate-200"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    {row.getVisibleCells().map((cell) => {
                      const stickyRight = Boolean((cell.column.columnDef.meta as any)?.stickyRight);
                      return (
                        <td
                          key={cell.id}
                          className={`px-4 py-3 text-slate-700 dark:text-slate-300 ${
                            stickyRight
                              ? 'md:sticky md:right-0 md:z-10 md:border-l md:border-slate-100 md:bg-white md:shadow-[-6px_0_12px_-6px_rgba(15,23,42,0.08)] md:group-hover:bg-slate-50 dark:md:border-slate-800 dark:md:bg-slate-900 dark:md:group-hover:bg-slate-800'
                              : ''
                          }`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row dark:border-slate-800 dark:text-slate-400">
            <span className="tabular-nums">
              Showing {table.getRowModel().rows.length} of {filteredData.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
              </span>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
