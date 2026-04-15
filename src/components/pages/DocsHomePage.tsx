'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDocsStore } from '@/store/useDocsStore';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import DocsEmptyAnimation from '@/components/docs/DocsEmptyAnimation';

export default function DocsHomePage() {
  const router = useRouter();
  const docs = useDocsStore((s) => s.docs);
  const createDoc = useDocsStore((s) => s.createDoc);
  const searchResults = useDocsStore((s) => s.searchResults);
  const isSearching = useDocsStore((s) => s.isSearching);
  const search = useDocsStore((s) => s.search);
  const clearSearch = useDocsStore((s) => s.clearSearch);
  const { data: session } = authClient.useSession();

  const [searchQuery, setSearchQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDocs = docs.filter((d) => !d.isArchived);
  const pinnedDocs = activeDocs.filter((d) => d.isPinned);
  const recentDocs = [...activeDocs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (!value.trim()) {
        clearSearch();
        return;
      }
      searchTimer.current = setTimeout(() => {
        search(value);
      }, 300);
    },
    [search, clearSearch]
  );

  const handleNewDoc = useCallback(async () => {
    const id = await createDoc({});
    if (id) router.push(`/docs/${id}`);
  }, [createDoc, router]);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = session?.user?.name?.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
      {/* Header — editorial */}
      <div className="flex items-end justify-between gap-4 mb-6 pb-5 border-b border-border/60">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · Library
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            {greeting}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 italic">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button onClick={handleNewDoc} size="sm">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New doc
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <Input
          placeholder="Search all docs..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 bg-card border-border/60"
        />
      </div>

      {/* Search results */}
      {searchQuery.trim() && (
        <div className="mb-8">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Search results
          </h2>
          {isSearching ? (
            <p className="text-sm text-muted-foreground">Searching...</p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results found</p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result) => (
                <Link
                  key={result.id}
                  href={`/docs/${result.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <span className="text-[14px] flex-shrink-0">{result.icon || '📄'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                    <p
                      className="text-xs text-muted-foreground truncate [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                      dangerouslySetInnerHTML={{ __html: result.excerpt }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 flex-shrink-0">
                    {formatDistanceToNow(new Date(result.updatedAt), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pinned docs */}
      {!searchQuery.trim() && pinnedDocs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Pinned
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {pinnedDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/docs/${doc.id}`}
                className="bg-card border border-border/60 rounded-xl p-4 hover:border-border hover:shadow-sm transition-all"
              >
                <span className="text-[20px] block mb-2">{doc.icon || '📄'}</span>
                <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent docs */}
      {!searchQuery.trim() && recentDocs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Recent
          </h2>
          <div className="space-y-0.5">
            {recentDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/docs/${doc.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm flex-shrink-0">{doc.icon || '📄'}</span>
                <span className="text-sm text-foreground flex-1 truncate">{doc.title}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!searchQuery.trim() && activeDocs.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <DocsEmptyAnimation />
          <h2 className="text-lg font-medium text-foreground mb-1">Your docs live here</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Notes, plans, and briefs — connected to your real work.
          </p>
          <Button onClick={handleNewDoc}>Create your first doc</Button>
          <div className="flex gap-2 mt-4">
            {['Meeting Notes', 'Project Brief', 'Weekly Review', 'Daily Journal'].map((name) => (
              <button
                key={name}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/60 transition-colors"
                onClick={async () => {
                  const id = await createDoc({ title: name });
                  if (id) router.push(`/docs/${id}`);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={handleNewDoc}
        className="md:hidden fixed bottom-20 right-4 z-40 bg-primary text-primary-foreground rounded-full w-14 h-14 shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="New document"
      >
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
