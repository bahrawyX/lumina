'use client';

import React from 'react';
import { TEMPLATE_REGISTRY, type TemplateId } from './templateContent';

interface TemplateCardsProps {
  loadingTemplate: TemplateId | null;
  onSelect: (id: TemplateId) => void;
  /** Compact variant for the non-empty state (above the doc list). */
  compact?: boolean;
}

export function TemplateCards({ loadingTemplate, onSelect, compact = false }: TemplateCardsProps) {
  return (
    <div
      className={
        compact
          ? 'grid grid-cols-2 sm:grid-cols-4 gap-2'
          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'
      }
    >
      {TEMPLATE_REGISTRY.map((tpl) => {
        const isLoading = loadingTemplate === tpl.id;
        const isDisabled = loadingTemplate !== null;
        return (
          <button
            key={tpl.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(tpl.id)}
            aria-label={`Create from ${tpl.title} template`}
            className={[
              'group text-left rounded-xl border bg-card/50 transition-all duration-150',
              compact ? 'p-3' : 'p-4',
              isDisabled
                ? 'opacity-60 cursor-not-allowed'
                : 'border-border/40 hover:border-border hover:bg-card cursor-pointer',
              isLoading ? 'animate-pulse' : '',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={compact ? 'text-lg leading-none' : 'text-2xl leading-none'}>
                {tpl.emoji}
              </span>
              {tpl.liveData && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium tracking-wide whitespace-nowrap">
                  Live data
                </span>
              )}
            </div>
            <p
              className={[
                'font-medium text-foreground',
                compact ? 'text-xs' : 'text-sm',
              ].join(' ')}
            >
              {isLoading ? 'Creating…' : tpl.title}
            </p>
            {!compact && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {tpl.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
