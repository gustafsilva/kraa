import { Button } from "@/components/ui/button";

interface FooterProps {
  canReplace: boolean;
  /** True only once the cleaned result (improve:done) is available. */
  resultReady: boolean;
  onReplace: () => void;
  onCopy: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";

export function Footer({ canReplace, resultReady, onReplace, onCopy }: FooterProps) {
  return (
    <footer className="flex items-center justify-between gap-2 border-t px-5 py-2.5 [--wails-draggable:no-drag]">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <kbd>esc</kbd>
        fechar
      </span>
      <div className="flex items-center gap-2">
        {canReplace && (
          <Button variant="ghost" onClick={onReplace} disabled={!resultReady} className="h-8 gap-2 px-3">
            Substituir
            <span className="flex gap-0.5 text-muted-foreground">
              <kbd>{mod}</kbd>
              <kbd>↵</kbd>
            </span>
          </Button>
        )}
        <Button onClick={onCopy} disabled={!resultReady} className="h-8 gap-2 rounded-full px-3.5">
          Copiar
          <span className="flex gap-0.5 opacity-75">
            <kbd>{mod}</kbd>
            <kbd>{shift}</kbd>
            <kbd>C</kbd>
          </span>
        </Button>
      </div>
    </footer>
  );
}
