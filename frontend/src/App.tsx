import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ActionList } from "@/components/ActionList";
import { PreviewPane } from "@/components/PreviewPane";
import { Footer } from "@/components/Footer";
import { ModelPicker } from "@/components/ModelPicker";
import { Mascot, type MascotPose } from "@/components/Mascot";
import { VersionNav } from "@/components/VersionNav";
import { RefineInput } from "@/components/RefineInput";
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
    versions,
    current,
    currentVersion,
    prevVersion,
    nextVersion,
    refine,
    regenerate,
  } = useImprove();

  // Substituir/Copiar (buttons and shortcuts) act on the cleaned result, and
  // also on the version shown after an error (regenerate/refine failing must
  // not strand the previous, still-good version behind disabled buttons).
  const resultReady = (status === "done" || (status === "error" && currentVersion !== null)) && output.trim().length > 0;

  // Mudanças (diff) is a per-session toggle: a new capture (selectionSeq)
  // turns it back off so the next result always starts on the plain preview.
  const [showDiff, setShowDiff] = useState(false);
  const [refineFocusSeq, setRefineFocusSeq] = useState(0);
  useEffect(() => setShowDiff(false), [selectionSeq]);

  function isReplaceShortcut(event: { metaKey: boolean; ctrlKey: boolean; key: string }) {
    return (event.metaKey || event.ctrlKey) && event.key === "Enter";
  }

  // Plain Enter in the action search starts a request (the highlighted action
  // or "Usar como instrução"); ⌘/Ctrl+Enter must never do that — it's
  // reserved for Substituir. cmdk's own root handler treats *any* Enter
  // (modified or not) as "select the highlighted item", so it would fire
  // Start() alongside this shortcut without this interception. We steal the
  // event in the capture phase (before cmdk ever sees it) and stop it from
  // propagating any further, so the *global* keydown listener below never
  // gets it either — this handler is the single place that calls replace()
  // for ⌘/Ctrl+Enter raised from the action search.
  function handleReplaceShortcutCapture(event: React.KeyboardEvent) {
    if (!isReplaceShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (canReplace && resultReady) void replace();
  }

  const isStreaming = status === "streaming";

  // ⌘/Ctrl+Enter → Substituir · ⌘/Ctrl+Shift+C → Copiar, as a global
  // fallback for when focus is anywhere else (preview textarea, buttons, no
  // focus at all). The action search intercepts ⌘/Ctrl+Enter itself before it can bubble here (see
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
        return;
      }
      // Bracket codes (physical key position) win over the key's character
      // so this still works on layouts (e.g. ABNT2) where the browser maps
      // BracketLeft/BracketRight to characters other than "[" and "]".
      const key = event.key.toLowerCase();
      const isPrevVersion = event.code === "BracketLeft" || (event.code !== "BracketRight" && key === "[");
      const isNextVersion = event.code === "BracketRight" || (event.code !== "BracketLeft" && key === "]");
      if (isPrevVersion) {
        event.preventDefault();
        prevVersion();
        return;
      }
      if (isNextVersion) {
        event.preventDefault();
        nextVersion();
        return;
      }
      if (key === "r" && !event.shiftKey) {
        // Always swallow ⌘/Ctrl+R: in the webview it would reload the modal.
        event.preventDefault();
        if (currentVersion && !isStreaming) regenerate();
        return;
      }
      if (key === "d" && !event.shiftKey) {
        event.preventDefault();
        if (currentVersion && !isStreaming) setShowDiff((v) => !v);
        return;
      }
      if (key === "l" && !event.shiftKey) {
        event.preventDefault();
        if (resultReady) setRefineFocusSeq((n) => n + 1);
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canReplace, resultReady, replace, copy, prevVersion, nextVersion, currentVersion, isStreaming, regenerate]);

  // Keyboard-only flow: when a result lands and the user is still in the
  // action list (or nowhere), hand focus to the result bar so ←/→ + Enter
  // apply it. Never steal focus from someone editing the source/result.
  const [resultFocusSeq, setResultFocusSeq] = useState(0);
  const [backSeq, setBackSeq] = useState(0);
  const prevStatus = useRef(status);
  useEffect(() => {
    const becameDone = prevStatus.current !== "done" && status === "done";
    prevStatus.current = status;
    if (!becameDone || !output.trim()) return;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('[data-slot="action-list"]')) {
      setResultFocusSeq((n) => n + 1);
    }
  }, [status, output]);

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
            <span
              data-slot="kraa-glyph"
              aria-hidden="true"
              className="kraa-glyph size-4 shrink-0 bg-foreground"
            />
            Kraa
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
            className="max-h-16 min-h-10 resize-none rounded-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-foreground/85 shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent [--wails-draggable:no-drag]"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[12.5rem_1fr] gap-3">
          <ActionList
            actions={actions}
            onSelectAction={(actionId) => start({ actionId })}
            onFreeInstruction={(instruction) => start({ freeInstruction: instruction })}
            focusToken={selectionSeq + backSeq}
            onKeyDownCapture={handleReplaceShortcutCapture}
            className="rounded-xl border bg-card/40 p-1.5"
          />
          <PreviewPane
            value={output}
            onChange={setOutput}
            editable={status === "done" || (status === "error" && currentVersion !== null)}
            streaming={isStreaming}
            placeholder={isStreaming ? "Gerando…" : "Escolha uma ação ou digite uma instrução."}
            mascot={previewMascot}
            header={
              currentVersion && (
                <VersionNav
                  label={currentVersion.label}
                  index={current}
                  total={versions.length}
                  onPrev={prevVersion}
                  onNext={nextVersion}
                  onRegenerate={regenerate}
                  showDiff={showDiff}
                  onToggleDiff={() => setShowDiff((v) => !v)}
                  disabled={isStreaming}
                />
              )
            }
            diff={showDiff && currentVersion && !isStreaming ? { base: currentVersion.baseText, text: output } : null}
            footer={resultReady && <RefineInput onSubmit={refine} focusToken={refineFocusSeq} />}
          />
        </div>

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
        focusToken={resultFocusSeq}
        onBack={() => setBackSeq((n) => n + 1)}
        hasVersions={versions.length > 1}
      />
    </div>
  );
}

export default App;
