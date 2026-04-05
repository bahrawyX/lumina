'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDocsStore } from '@/store/useDocsStore';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { DocTreeNode } from '@/types/doc';

interface SidebarDocsTreeProps {
  collapsed?: boolean;
  showTooltip?: boolean;
}

function buildTree(docs: DocTreeNode[]): (DocTreeNode & { children: DocTreeNode[] })[] {
  const childrenMap = new Map<string | 'root', DocTreeNode[]>();
  for (const doc of docs) {
    const key = doc.parentId ?? 'root';
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(doc);
  }

  function attachChildren(node: DocTreeNode): DocTreeNode & { children: DocTreeNode[] } {
    const kids = (childrenMap.get(node.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map(attachChildren);
    return { ...node, children: kids };
  }

  return (childrenMap.get('root') ?? [])
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.position - b.position;
    })
    .map(attachChildren);
}

function DocTreeItemComponent({
  node,
  depth,
}: {
  node: DocTreeNode & { children: (DocTreeNode & { children: DocTreeNode[] })[] };
  depth: number;
}) {
  const pathname = usePathname();
  const isActive = pathname === `/docs/${node.id}`;
  const expandedIds = useDocsStore((s) => s.expandedIds);
  const toggleExpanded = useDocsStore((s) => s.toggleExpanded);
  const archiveDoc = useDocsStore((s) => s.archiveDoc);
  const pinDoc = useDocsStore((s) => s.pinDoc);
  const createDoc = useDocsStore((s) => s.createDoc);
  const updateDoc = useDocsStore((s) => s.updateDoc);
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.includes(node.id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.title);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.title) {
      updateDoc(node.id, { title: trimmed });
    }
    setIsRenaming(false);
  }, [renameValue, node.title, node.id, updateDoc]);

  return (
    <>
      <SidebarMenuItem>
        <div
          className={cn(
            'group flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer select-none w-full',
            'hover:bg-muted/60 transition-colors',
            isActive && 'bg-muted text-foreground'
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {/* Expand/collapse chevron */}
          <button
            type="button"
            className={cn(
              'flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/50',
              !hasChildren && 'invisible'
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleExpanded(node.id);
            }}
          >
            <motion.svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <polyline points="9 18 15 12 9 6" />
            </motion.svg>
          </button>

          {/* Icon */}
          <span className="flex-shrink-0 text-sm w-4 text-center">
            {node.icon || (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            )}
          </span>

          {/* Title */}
          {isRenaming ? (
            <input
              className="flex-1 text-sm bg-transparent border-b border-primary outline-none min-w-0"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
            />
          ) : (
            <Link
              href={`/docs/${node.id}`}
              className="flex-1 text-sm truncate max-w-[140px] text-foreground"
            >
              {node.title}
            </Link>
          )}

          {/* Context menu + add subpage */}
          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
            <button
              type="button"
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (depth < 4) {
                  await createDoc({ parentId: node.id });
                }
              }}
              title="Add subpage"
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => { setRenameValue(node.title); setIsRenaming(true); }}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => pinDoc(node.id, !node.isPinned)}>
                  {node.isPinned ? 'Unpin' : 'Pin to top'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => archiveDoc(node.id)}
                >
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </SidebarMenuItem>

      {/* Children */}
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            {node.children.map((child) => (
              <DocTreeItemComponent key={child.id} node={child as any} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function SidebarDocsTree({ collapsed }: SidebarDocsTreeProps) {
  const docs = useDocsStore((s) => s.docs);
  const createDoc = useDocsStore((s) => s.createDoc);
  const dbHydrated = useDocsStore((s) => s.dbHydrated);

  const activeDocs = docs.filter((d) => !d.isArchived);
  const tree = buildTree(activeDocs);

  if (!dbHydrated) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <span className={cn(collapsed && 'sr-only')}>Docs</span>
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={() => createDoc({})}
          title="New doc"
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {tree.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-muted-foreground text-xs italic"
                onClick={() => createDoc({})}
              >
                {collapsed ? '' : 'No docs yet'}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            tree.map((node) => (
              <DocTreeItemComponent key={node.id} node={node as any} depth={0} />
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
