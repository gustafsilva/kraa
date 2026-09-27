import { useEffect, useState } from "react";
import { CornerDownLeft, PenLine, RotateCcw, Sparkles, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionList } from "@/components/ActionList";
import { PreviewPane } from "@/components/PreviewPane";
import { Footer } from "@/components/Footer";
import { ModelPicker } from "@/components/ModelPicker";
import { Mascot, type MascotPose } from "@/components/Mascot";
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
    actionError,
    selectionSeq,
    start,
    retry,
    setOutput,
    setText,
    replace,
    copy,
    close,
    model,
    models,
    modelsError,
    modelSaving,
    setModel,
  } = useImprove();

  const [freeInstruction, setFreeInstruction] = useState("");

  // Substituir/Copiar (buttons and shortcuts) only act on the cleaned result:
  // never on partial stream output, and not after an error (retry instead).
  const resultReady = status === "done" && output.trim().length > 0;

  function isReplaceShortcut(event: { metaKey: boolean; ctrlKey: boolean; key: string }) {
    return (event.metaKey || event.ctrlKey) && event.key === "Enter";
  }

  // Plain Enter in the action search / free-instruction field starts a
  // request; ⌘/Ctrl+Enter must never do that — it's reserved for Substituir.
  // cmdk's own root handler treats *any* Enter (modified or not) as "select
  // the highlighted action", and the free-instruction field's own handler
  // doesn't look at modifiers either, so both would fire Start() alongside
  // this shortcut without this interception. We steal the event in the
  // capture phase (before cmdk / the field's onKeyDown ever see it) and stop
  // it from propagating any further, so the *global* keydown listener below
  // never gets it either — this handler is the single place that calls
  // replace() for ⌘/Ctrl+Enter raised from these two fields.
  function handleReplaceShortcutCapture(event: React.KeyboardEvent) {
    if (!isReplaceShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (canReplace && resultReady) void replace();
  }

  // ⌘/Ctrl+Enter → Substituir · ⌘/Ctrl+Shift+C → Copiar, as a global
  // fallback for when focus is anywhere else (preview textarea, buttons, no
  // focus at all). The action search and free-instruction fields intercept
  // ⌘/Ctrl+Enter themselves before it can bubble here (see
  // handleReplaceShortcutCapture), so this never double-fires for them.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "Enter") {
        if (canReplace && resultReady) {
          event.preventDefault();
          void replace();
        }
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === "c") {
        if (resultReady) {
          event.preventDefault();
          void copy();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canReplace, resultReady, replace, copy]);

  function handleFreeInstructionKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (isReplaceShortcut(event)) return;
    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && freeInstruction.trim()) {
      event.preventDefault();
      start({ freeInstruction: freeInstruction.trim() });
    }
  }

  const isStreaming = status === "streaming";

  // Kraa in the empty preview: typing before the first token, waving when
  // there is text ready for an action, "empty" when there is nothing to
  // improve yet. On error the request alert carries the mascot instead.
  const previewMascot: MascotPose | null = isStreaming
    ? "typing"
    : status === "error"
      ? null
      : text.trim()
        ? "wave"
        : "empty";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-2.5 [--wails-draggable:drag]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold tracking-tight">
            <PenLine className="size-3.5 text-pencil" aria-hidden="true" />
            Prompt Improve
          </span>
          <ModelPicker
            model={model}
            models={models}
            error={modelsError}
            disabled={isStreaming || modelSaving}
            onChange={(m) => void setModel(m)}
          />
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => void close()}
          className="[--wails-draggable:no-drag] rounded-md p-1 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-5 py-3.5">
        {configError && (
          <Alert variant="destructive">
            <AlertTitle>Erro de configuração</AlertTitle>
            <AlertDescription>{configError}</AlertDescription>
          </Alert>
        )}

        {warning && (
          <Alert>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}

        <div className="-ml-3 flex shrink-0 flex-col gap-1 border-l-2 border-graphite pl-2.5 transition-colors focus-within:border-pencil">
          <label htmlFor="source-text" className="text-[11px] font-medium text-muted-foreground">
            Texto a melhorar
          </label>
          <Textarea
            id="source-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Cole ou digite o texto aqui"
            className="max-h-20 min-h-10 resize-none rounded-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-foreground/85 shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent [--wails-draggable:no-drag]"
          />
        </div>

        <ActionList
          actions={actions}
          onSelectAction={(actionId) => start({ actionId })}
          focusToken={selectionSeq}
          onKeyDownCapture={handleReplaceShortcutCapture}
        />

        <div className="relative shrink-0 [--wails-draggable:no-drag]">
          <Sparkles
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={freeInstruction}
            onChange={(event) => setFreeInstruction(event.target.value)}
            onKeyDown={handleFreeInstructionKeyDown}
            onKeyDownCapture={handleReplaceShortcutCapture}
            placeholder="Ou descreva o que deseja (instrução livre)…"
            aria-label="Instrução livre"
            className="h-9 rounded-full bg-card pr-10 pl-8.5 text-[13px] md:text-[13px]"
          />
          <CornerDownLeft
            className={`pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2 transition-opacity ${
              freeInstruction.trim() ? "text-pencil opacity-100" : "text-muted-foreground opacity-40"
            }`}
            aria-hidden="true"
          />
        </div>

        <PreviewPane
          value={output}
          onChange={setOutput}
          editable={status === "done"}
          streaming={isStreaming}
          placeholder={isStreaming ? "Gerando…" : "O resultado aparece aqui."}
          mascot={previewMascot}
        />

        {status === "error" && requestError && (
          <Alert variant="destructive" className="grid-cols-[auto_1fr] gap-x-2.5">
            <Mascot pose="error" size={36} className="row-span-2 self-center" />
            <AlertTitle className="col-start-2">Não foi possível melhorar o texto</AlertTitle>
            <AlertDescription className="col-start-2 flex items-center justify-between gap-2">
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

        {actionError && (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível concluir a ação</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
      </div>

      <Footer
        canReplace={canReplace}
        resultReady={resultReady}
        onReplace={() => void replace()}
        onCopy={() => void copy()}
      />
    </div>
  );
}

export default App;
