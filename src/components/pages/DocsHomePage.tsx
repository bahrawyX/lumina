'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useDocsStore } from '@/store/useDocsStore';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import DocsEmptyAnimation from '@/components/docs/DocsEmptyAnimation';
import {
  meetingNotesContent,
  weeklyReviewContent,
  projectBriefContent,
  dailyJournalContent,
  TEMPLATE_REGISTRY,
  type TemplateId,
  type TiptapDoc,
} from '@/components/docs/templates/templateContent';
import { useTemplateData } from '@/components/docs/templates/useTemplateData';
import { TemplateCards } from '@/components/docs/templates/TemplateCards';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type CreateChoice = TemplateId; // 'blank' | the four template IDs

export default function DocsHomePage() {
  const router = useRouter();
  const docs = useDocsStore((s) => s.docs);
  const createDoc = useDocsStore((s) => s.createDoc);
  const searchResults = useDocsStore((s) => s.searchResults);
  const isSearching = useDocsStore((s) => s.isSearching);
  const search = useDocsStore((s) => s.search);
  const clearSearch = useDocsStore((s) => s.clearSearch);
  const { data: session } = authClient.useSession();

  const { fetchWeeklyReviewData, fetchDailyJournalData } = useTemplateData();

  const [searchQuery, setSearchQuery] = useState('');
  const [loadingTemplate, setLoadingTemplate] = useState<TemplateId | null>(null);
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
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
    [search, clearSearch],
  );

  // ── Template-driven creation ───────────────────────────────────────────
  const createFromTemplate = useCallback(
    async (choice: CreateChoice) => {
      setLoadingTemplate(choice);
      try {
        const today = format(new Date(), 'EEEE, MMMM d, yyyy');
        let title = 'Untitled';
        let content: TiptapDoc | null = null;
        let icon: string | undefined;

        switch (choice) {
          case 'blank':
            title = 'Untitled';
            content = null;
            break;
          case 'meeting':
            title = `Meeting Notes — ${format(new Date(), 'MMM d, yyyy')}`;
            content = meetingNotesContent(today);
            icon = '📋';
            break;
          case 'brief':
            title = 'Project Brief';
            content = projectBriefContent(today);
            icon = '📁';
            break;
          case 'weekly': {
            const data = await fetchWeeklyReviewData();
            title = `Weekly Review — ${data.weekLabel}`;
            content = weeklyReviewContent(
              data.weekLabel,
              data.completedTasks,
              data.overdueTasks,
              data.upcomingTasks,
            );
            icon = '🔄';
            break;
          }
          case 'journal': {
            const data = await fetchDailyJournalData();
            title = `Journal — ${format(new Date(), 'MMMM d, yyyy')}`;
            content = dailyJournalContent(today, data.todayTasks);
            icon = '📓';
            break;
          }
        }

        const id = await createDoc({
          title,
          icon,
          content: content ?? undefined,
          contentText: content ? extractPlainText(content) : undefined,
        });
        if (!id) {
          // useDocsStore.createDoc surfaces its own error toast on failure.
          return;
        }
        router.push(`/docs/${id}`);
      } catch (err) {
        console.error('[createFromTemplate]', err);
        toast.error("Couldn't create from template", {
          description: 'Something went wrong building the template.',
        });
      } finally {
        setLoadingTemplate(null);
      }
    },
    [createDoc, fetchDailyJournalData, fetchWeeklyReviewData, router],
  );

  const handleSelectTemplate = useCallback(
    (id: TemplateId) => {
      void createFromTemplate(id);
    },
    [createFromTemplate],
  );

  const handleNewDocBlank = useCallback(() => {
    void createFromTemplate('blank');
  }, [createFromTemplate]);

  // ── Greeting ───────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = session?.user?.name?.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
      {/* Header */}
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

        {/* New doc dropdown — blank or any template */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={loadingTemplate !== null}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New doc
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="ml-1.5 opacity-70">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-56">
            <DropdownMenuItem onClick={handleNewDocBlank}>
              <span className="text-base leading-none mr-2">＋</span>
              <span className="flex-1">Blank doc</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {TEMPLATE_REGISTRY.map((tpl) => (
              <DropdownMenuItem key={tpl.id} onClick={() => handleSelectTemplate(tpl.id)}>
                <span className="text-base leading-none mr-2">{tpl.emoji}</span>
                <span className="flex-1">{tpl.title}</span>
                {tpl.liveData && (
                  <span className="text-[9px] px-1 py-0.5 rounded-full bg-primary/10 text-primary font-medium ml-2 tracking-wide">
                    Live
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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

      {/* Templates row — shown above the doc list when the user already has docs */}
      {!searchQuery.trim() && activeDocs.length > 0 && (
        <div className="mb-8">
          <button
            type="button"
            onClick={() => setTemplatesExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 hover:text-foreground transition-colors"
          >
            <span>Templates</span>
            <motion.svg
              width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              animate={{ rotate: templatesExpanded ? 90 : 0 }}
              transition={{ duration: 0.12 }}
            >
              <polyline points="9 18 15 12 9 6" />
            </motion.svg>
          </button>
          <motion.div
            initial={false}
            animate={{ height: templatesExpanded ? 'auto' : 0, opacity: templatesExpanded ? 1 : 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <TemplateCards
              loadingTemplate={loadingTemplate}
              onSelect={handleSelectTemplate}
              compact
            />
          </motion.div>
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

      {/* Empty state — animation, "blank doc" CTA, then 4 template cards */}
      {!searchQuery.trim() && activeDocs.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center py-10"
        >
          <DocsEmptyAnimation />
          <h2 className="text-lg font-medium text-foreground mb-1">Your docs live here</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            Notes, plans, and briefs — connected to your real work.
          </p>
          <Button onClick={handleNewDocBlank} disabled={loadingTemplate !== null}>
            {loadingTemplate === 'blank' ? 'Creating…' : 'Create your first doc'}
          </Button>

          <div className="w-full mt-10 text-left">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.18em] mb-3">
              Or start from a template
            </p>
            <TemplateCards loadingTemplate={loadingTemplate} onSelect={handleSelectTemplate} />
          </div>
        </motion.div>
      )}

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={handleNewDocBlank}
        disabled={loadingTemplate !== null}
        className="md:hidden fixed bottom-20 right-4 z-40 bg-primary text-primary-foreground rounded-full w-14 h-14 shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
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

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Walk a Tiptap doc and concatenate every text node's text. Used as the
 * `contentText` mirror so FTS + word count are accurate from the moment
 * the template-filled doc is created.
 */
function extractPlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text' && typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) {
    return n.content
      .map((c) => extractPlainText(c))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}
