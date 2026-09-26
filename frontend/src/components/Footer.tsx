import { Button } from "@/components/ui/button";

interface FooterProps {
  canReplace: boolean;
  /** True only once the cleaned result (improve:done) is available. */
  resultReady: boolean;
  onReplace: () => void;
  onCopy: () => void;
}

export function Footer({ canReplace, resultReady, onReplace, onCopy }: FooterProps) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t px-3 py-2 [--wails-draggable:no-drag]">
      {canReplace && (
        <Button variant="outline" onClick={onReplace} disabled={!resultReady}>
          Substituir
          <span className="ml-1.5 text-xs text-muted-foreground">⌘/Ctrl+Enter</span>
        </Button>
      )}
      <Button onClick={onCopy} disabled={!resultReady}>
        Copiar
        <span className="ml-1.5 text-xs opacity-70">⌘/Ctrl+Shift+C</span>
      </Button>
    </footer>
  );
}
