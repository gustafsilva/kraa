import { useMemo } from "react";
import { diffWordsWithSpace } from "diff";
import { cn } from "@/lib/utils";

export interface DiffViewProps {
  /** Text the version was rewritten from (original or refined version). */
  base: string;
  /** The version's current text. */
  text: string;
  className?: string;
}

/** Read-only word diff: insertions in pencil blue, removals struck through. */
export function DiffView({ base, text, className }: DiffViewProps) {
  const parts = useMemo(() => diffWordsWithSpace(base, text), [base, text]);
  return (
    <div
      data-slot="diff-view"
      role="region"
      aria-label="Mudanças"
      className={cn(
        "min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-[14px] leading-relaxed [--wails-draggable:no-drag]",
        className,
      )}
    >
      {parts.map((part, i) =>
        part.added ? (
          <ins key={i} className="rounded-sm bg-pencil-wash px-0.5 text-pencil no-underline">
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={i} className="text-muted-foreground decoration-destructive/70">
            {part.value}
          </del>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </div>
  );
}
