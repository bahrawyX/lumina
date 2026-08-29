'use client';

import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckIcon } from '@/components/icons/CheckIcons';

export interface SidebarContext {
  name: string;
  color: string;
}

interface Props {
  allCategories: SidebarContext[];
  customCategories: SidebarContext[];
  activeFilters: string[];
  collapsed: boolean;
  onToggleFilter: (name: string) => void;
  onClearFilters: () => void;
  onAddContext: () => void;
  onEditContext: (name: string) => void;
  onDeleteContext: (name: string) => void;
}

/**
 * Contexts, in a popover instead of an ever-growing list.
 *
 * Every context rendered as its own sidebar row. With the six built-ins that
 * looks fine; with forty it pushes Ambient Sounds, Notifications and Contact
 * so far down that the only way to reach them is to scroll past every context
 * the user has ever created — and the sidebar gave no sign there was anything
 * below to scroll to.
 *
 * The whole set now lives behind one row. Opening it puts every context on
 * screen at once, which is the version that needs the least learning: no
 * scrolling for a typical account, one click to filter, and the search field
 * appears only once there are enough to justify it.
 *
 * The active filters stay summarised on the trigger, so the sidebar still
 * answers "what am I filtered to?" without being opened.
 */
const SEARCH_THRESHOLD = 8;

export function SidebarContexts({
  allCategories,
  customCategories,
  activeFilters,
  collapsed,
  onToggleFilter,
  onClearFilters,
  onAddContext,
  onEditContext,
  onDeleteContext,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const showSearch = allCategories.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCategories, query]);

  const isCustom = (name: string) => customCategories.some((c) => c.name === name);
  const activeCount = activeFilters.length;

  /** The dots shown on the trigger — a glance-able summary of the filter. */
  const summaryDots = (activeCount > 0 ? allCategories.filter((c) => activeFilters.includes(c.name)) : allCategories)
    .slice(0, 5);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-tutorial="contexts"
              aria-label={
                activeCount > 0
                  ? `Contexts, ${activeCount} filter${activeCount === 1 ? '' : 's'} active`
                  : 'Contexts'
              }
              className={`w-full flex items-center gap-2 rounded-lg h-8 px-2 text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <span className="flex items-center gap-[3px] flex-shrink-0">
                {summaryDots.map((c) => (
                  <span
                    key={c.name}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: c.color, opacity: activeCount > 0 ? 1 : 0.7 }}
                  />
                ))}
              </span>
              {!collapsed && (
                <>
                  <span className="font-sans text-[13px] truncate">Contexts</span>
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/60">
                    {activeCount > 0 ? `${activeCount}/${allCategories.length}` : allCategories.length}
                  </span>
                </>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">Contexts</TooltipContent>}
      </Tooltip>

      {/* To the right, outside the sidebar, so it is never clipped by it. */}
      <PopoverContent side="right" align="start" sideOffset={10} className="w-64 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
            Contexts
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {showSearch && (
          <div className="p-2 border-b border-border/60">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contexts…"
              className="h-7 text-xs"
              aria-label="Search contexts"
              autoFocus
            />
          </div>
        )}

        <div className="max-h-[min(60vh,20rem)] overflow-y-auto py-1">
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              No context matches “{query}”.
            </p>
          ) : (
            visible.map((cat) => {
              const active = activeFilters.includes(cat.name);
              return (
                <div key={cat.name} className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => onToggleFilter(cat.name)}
                    aria-pressed={active}
                    className={`flex-1 flex items-center gap-2 h-8 pl-3 pr-9 text-left transition-colors hover:bg-accent/50 ${
                      active ? 'text-foreground' : 'text-muted-foreground/80'
                    }`}
                  >
                    <span
                      className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: cat.color, opacity: active ? 1 : 0.7 }}
                    />
                    <span className="font-sans text-[13px] truncate">{cat.name}</span>
                    {active && (
                      <CheckIcon size={12} strokeWidth={2.5} className="ml-auto text-primary" />
                    )}
                  </button>

                  {isCustom(cat.name) && (
                    <div
                      className={`absolute right-1 top-1/2 -translate-y-1/2 transition-opacity ${
                        menuFor === cat.name ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <DropdownMenu
                        open={menuFor === cat.name}
                        onOpenChange={(o) => setMenuFor(o ? cat.name : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Manage ${cat.name} context`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                          >
                            <span aria-hidden className="text-[13px] leading-none">⋯</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44" sideOffset={6}>
                          <DropdownMenuItem
                            onClick={() => {
                              setMenuFor(null);
                              setOpen(false);
                              onEditContext(cat.name);
                            }}
                          >
                            Edit context
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setMenuFor(null);
                              onDeleteContext(cat.name);
                            }}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            Delete context
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60 p-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddContext();
            }}
            className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <span aria-hidden className="text-base leading-none">+</span>
            New context
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
