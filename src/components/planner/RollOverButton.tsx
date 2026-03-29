import React from 'react';

interface RollOverButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isRolling?: boolean;
  rolloverCount: number;
}

const RollOverIcon: React.FC = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="14" height="14" rx="2" />
    <path d="M7 2v4M13 2v4M3 9h14" />
    <path d="M14 17h7" />
    <path d="m18 13 3.5 4L18 21" />
  </svg>
);

export const RollOverButton: React.FC<RollOverButtonProps> = React.memo(({ onClick, disabled, isRolling, rolloverCount }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-muted/20 border border-border/40 backdrop-blur-md hover:bg-muted/40 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
      title={rolloverCount === 0 ? 'No unfinished tasks due today' : 'Move unfinished tasks to tomorrow'}
    >
      {isRolling ? (
        <>
          <svg className="animate-spin" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Rolling…
        </>
      ) : (
        <>
          <RollOverIcon />
          Roll Over
        </>
      )}
    </button>
  );
});

RollOverButton.displayName = 'RollOverButton';
