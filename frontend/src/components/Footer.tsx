import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FooterProps {
  canReplace: boolean;
  /** True only once the cleaned result (improve:done) is available. */
  resultReady: boolean;
  onReplace: () => void;
  onCopy: () => void;
  /** Bumped by the caller when a result becomes ready: focuses the default choice. */
  focusToken?: number;
  /** ↑ from the choice buttons: go back to the action list. */
  onBack?: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd>{keys}</kbd>
      {label}
    </span>
  );
}

/** Result bar: Copiar | Substituir, chosen with ←/→ and applied with Enter. */
export function Footer({ canReplace, resultReady, onReplace, onCopy, focusToken, onBack }: FooterProps) {
  // ui/button.tsx is a plain function component (no forwardRef in React 18),
  // so the choices are found through data-choice inside the group.
  const groupRef = useRef<HTMLDivElement>(null);
  const [inBar, setInBar] = useState(false);
  const choice = (name: "copy" | "replace") =>
    groupRef.current?.querySelector<HTMLButtonElement>(`button[data-choice="${name}"]`) ?? null;

  useEffect(() => {
    if (!focusToken || !resultReady) return;
    (choice(canReplace ? "replace" : "copy") ?? choice("copy"))?.focus();
    // Only a new token moves focus; canReplace/resultReady changes must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const target = document.activeElement === choice("copy") ? choice("replace") : choice("copy");
      target?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onBack?.();
    }
  }

  const choiceClass =
    "group/choice h-8 gap-2 px-3 focus-visible:ring-2 focus-visible:ring-pencil/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <footer className="flex items-center justify-between gap-2 border-t px-5 py-2.5 [--wails-draggable:no-drag]">
      <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {inBar ? (
          <>
            <Hint keys="←→" label="escolher" />
            <Hint keys="↵" label="aplicar" />
            <Hint keys="↑" label="voltar" />
          </>
        ) : (
          <>
            <Hint keys="↑↓" label="escolher" />
            <Hint keys="↵" label="executar" />
            <Hint keys="esc" label="fechar" />
          </>
        )}
      </span>
      <div
        ref={groupRef}
        role="group"
        aria-label="Aplicar resultado"
        className="flex items-center gap-2"
        onKeyDown={onKeyDown}
        onFocus={() => setInBar(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInBar(false);
        }}
      >
        <Button data-choice="copy" variant="outline" onClick={onCopy} disabled={!resultReady} className={choiceClass}>
          Copiar
          <span className="flex gap-0.5 text-muted-foreground">
            <kbd>{mod}</kbd>
            <kbd>{shift}</kbd>
            <kbd>C</kbd>
          </span>
        </Button>
        {canReplace && (
          <Button
            data-choice="replace"
            onClick={onReplace}
            disabled={!resultReady}
            className={cn(choiceClass, "rounded-lg", resultReady && "shadow-[0_0_0_4px_color-mix(in_oklab,var(--pencil)_18%,transparent)]")}
          >
            Substituir
            <span className="flex gap-0.5 opacity-75">
              <kbd>{mod}</kbd>
              <kbd>↵</kbd>
            </span>
          </Button>
        )}
      </div>
    </footer>
  );
}
