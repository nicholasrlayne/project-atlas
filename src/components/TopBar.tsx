import { ChevronLeft, ChevronDown } from 'lucide-react';

interface TopBarProps {
  onBack?: () => void;
  title: React.ReactNode;
  subtitle?: string;
  trailing?: React.ReactNode;
  onTitleClick?: () => void;
}

export function TopBar({ onBack, title, subtitle, trailing, onTitleClick }: TopBarProps) {
  return (
    <div className="flex items-center gap-2.5 pb-1.5">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] bg-cell-2 text-chalk"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {onTitleClick ? (
          <button onClick={onTitleClick} className="flex items-center gap-1 text-left">
            <span className="truncate text-sm font-semibold text-chalk">{title}</span>
            <ChevronDown size={14} className="shrink-0 text-mist" />
          </button>
        ) : (
          <div className="truncate text-sm font-semibold text-chalk">{title}</div>
        )}
        {subtitle && <div className="mt-0.5 truncate text-[11px] text-mist">{subtitle}</div>}
      </div>
      {trailing}
    </div>
  );
}

export function TimerChip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-[10px] border border-coral/30 bg-coral/10 px-2 py-1 font-mono text-[11px] text-coral">
      <span className="animate-atlas-pulse h-1.5 w-1.5 rounded-full bg-coral" />
      {label}
    </div>
  );
}
