import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionList } from "@/components/ActionList";
import { PreviewPane } from "@/components/PreviewPane";
import { Footer } from "@/components/Footer";
import { useImprove } from "@/hooks/useImprove";

function App() {
  const {
    text,
    actions,
    canReplace,
    warning,
    configError,
    status,
    output,
    requestError,
    selectionSeq,
    start,
    retry,
    setOutput,
    replace,
    copy,
    close,
  } = useImprove();

  const [freeInstruction, setFreeInstruction] = useState("");

  // ⌘/Ctrl+Enter → Substituir · ⌘/Ctrl+Shift+C → Copiar
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "Enter") {
        if (canReplace && output) {
          event.preventDefault();
          void replace();
        }
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === "c") {
        if (output) {
          event.preventDefault();
          void copy();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canReplace, output, replace, copy]);

  function handleFreeInstructionKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && freeInstruction.trim()) {
      event.preventDefault();
      start({ freeInstruction: freeInstruction.trim() });
    }
  }

  const isStreaming = status === "streaming";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b px-3 py-2 [--wails-draggable:drag]">
        <span className="text-sm font-medium">Prompt Improve</span>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => void close()}
          className="[--wails-draggable:no-drag] rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">
        {configError && (
          <Alert variant="destructive">
            <AlertTitle>Erro de configuração</AlertTitle>
            <AlertDescription>{configError}</AlertDescription>
          </Alert>
        )}

        {!canReplace && warning && (
          <Alert>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}

        <div className="shrink-0 rounded-lg border bg-muted/40 p-2 text-xs">
          <p className="mb-1 font-medium text-foreground/80">Texto selecionado</p>
          <div className="max-h-16 overflow-y-auto">
            <p className="whitespace-pre-wrap pr-2 text-muted-foreground">
              {text || "Nenhum texto capturado."}
            </p>
          </div>
        </div>

        <ActionList actions={actions} onSelectAction={(actionId) => start({ actionId })} focusToken={selectionSeq} />

        <Input
          value={freeInstruction}
          onChange={(event) => setFreeInstruction(event.target.value)}
          onKeyDown={handleFreeInstructionKeyDown}
          placeholder="Ou descreva o que deseja (instrução livre)…"
          aria-label="Instrução livre"
          className="shrink-0 [--wails-draggable:no-drag]"
        />

        <PreviewPane
          value={output}
          onChange={setOutput}
          editable={status === "done"}
          placeholder={isStreaming ? "Gerando…" : "O resultado aparece aqui."}
        />

        {status === "error" && requestError && (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível melhorar o texto</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{requestError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                className="[--wails-draggable:no-drag] shrink-0"
              >
                <RotateCcw className="size-3.5" />
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Footer
        canReplace={canReplace}
        hasOutput={output.trim().length > 0}
        onReplace={() => void replace()}
        onCopy={() => void copy()}
      />
    </div>
  );
}

export default App;
