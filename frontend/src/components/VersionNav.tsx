import { ChevronLeft, ChevronRight, GitCompareArrows, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VersionNavProps {
  label: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onRegenerate: () => void;
  showDiff: boolean;
  onToggleDiff: () => void;
  /** True while the model is writing: every control is disabled. */
  disabled?: boolean;
}

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl+";

const iconButton =
  "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-pencil/50 disabled:pointer-events-none disabled:opacity-40 [--wails-draggable:no-drag]";

/** Result header: version label, ‹ n/total ›, Gerar de novo and Mudanças. */
export function VersionNav({
  label,
  index,
  total,
  onPrev,
  onNext,
  onRegenerate,
  showDiff,
  onToggleDiff,
  disabled = false,
}: VersionNavProps) {
  return (
    <div data-slot="version-nav" className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[11px] text-muted-foreground" title={label}>
        {label}
      </span>
      <button type="button" aria-label="Versão anterior" title={`Versão anterior (${mod}[)`} className={iconButton} disabled={disabled || index <= 0} onClick={onPrev}>
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="text-[11px] tabular-nums text-muted-foreground">{`${index + 1}/${total}`}</span>
      <button type="button" aria-label="Próxima versão" title={`Próxima versão (${mod}])`} className={iconButton} disabled={disabled || index >= total - 1} onClick={onNext}>
        <ChevronRight className="size-3.5" />
      </button>
      <button type="button" aria-label="Gerar de novo" title={`Gerar de novo (${mod}R)`} className={iconButton} disabled={disabled} onClick={onRegenerate}>
        <RefreshCw className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Mudanças"
        aria-pressed={showDiff}
        title={`Mudanças (${mod}D)`}
        className={cn(iconButton, showDiff && "bg-pencil-wash text-pencil")}
        disabled={disabled}
        onClick={onToggleDiff}
      >
        <GitCompareArrows className="size-3.5" />
      </button>
    </div>
  );
}
