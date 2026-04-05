'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useDocsStore } from '@/store/useDocsStore';

interface DocBreadcrumbProps {
  docId: string;
}

export default function DocBreadcrumb({ docId }: DocBreadcrumbProps) {
  const docs = useDocsStore((s) => s.docs);

  const breadcrumbs = useMemo(() => {
    const chain: { id: string; title: string; icon: string | null }[] = [];
    let currentId: string | null = docId;

    while (currentId) {
      const doc = docs.find((d) => d.id === currentId);
      if (!doc) break;
      chain.unshift({ id: doc.id, title: doc.title, icon: doc.icon });
      currentId = doc.parentId;
    }

    return chain;
  }, [docs, docId]);

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4 overflow-x-auto">
      <Link href="/docs" className="hover:text-foreground transition-colors flex-shrink-0">
        Docs
      </Link>
      {breadcrumbs.map((crumb, i) => (
        <React.Fragment key={crumb.id}>
          <span className="flex-shrink-0 text-muted-foreground/50">/</span>
          {i === breadcrumbs.length - 1 ? (
            <span className="text-foreground truncate max-w-[200px] flex items-center gap-1">
              {crumb.icon && <span className="text-[12px]">{crumb.icon}</span>}
              {crumb.title}
            </span>
          ) : (
            <Link
              href={`/docs/${crumb.id}`}
              className="hover:text-foreground transition-colors truncate max-w-[120px] flex items-center gap-1"
            >
              {crumb.icon && <span className="text-[12px]">{crumb.icon}</span>}
              {crumb.title}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
