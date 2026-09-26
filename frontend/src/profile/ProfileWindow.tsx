import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { ImproveService } from "@bindings/github.com/gustavofreitas/prompt-improve/internal/app";
import type { ProfileDTO } from "@bindings/github.com/gustavofreitas/prompt-improve/internal/app";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Mirrors maxProfileChars in internal/app/profile.go. */
export const MAX_PROFILE_CHARS = 2000;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** "Perfil do usuário" window, opened from the tray (URL ?view=profile). */
export function ProfileWindow() {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const apply = (p: ProfileDTO) => {
      setEnabled(p.enabled);
      setText(p.text);
      setError("");
    };
    ImproveService.GetProfile()
      .then(apply)
      .catch((err: unknown) => setError(messageOf(err)));
    // Sent by Host.ShowProfile each time the window opens: drop stale edits.
    const off = Events.On("profile:open", (ev) => apply(ev.data as ProfileDTO));
    return () => off();
  }, []);

  const save = () => {
    setSaving(true);
    setError("");
    ImproveService.SaveProfile({ enabled, text })
      .then(() => ImproveService.CloseProfile())
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setSaving(false));
  };

  return (
    <main className="flex h-screen flex-col gap-4 bg-background p-5 text-foreground">
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">Perfil do usuário</h1>
        <p className="text-sm text-muted-foreground">
          Conte quem você é: cargo, stack, preferências. Com o perfil ativo, ele é enviado ao LLM nas ações
          de prompt e na instrução livre.
        </p>
      </header>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 accent-primary"
        />
        Usar perfil
      </label>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <label htmlFor="profile-text" className="text-sm font-medium">
          Sobre você
        </label>
        <Textarea
          id="profile-text"
          value={text}
          maxLength={MAX_PROFILE_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex.: Sou desenvolvedor sênior fullstack (Go e React). Prefiro respostas técnicas e diretas."
          className="min-h-0 flex-1 resize-none field-sizing-fixed"
        />
        <span className="self-end text-xs text-muted-foreground">
          {text.length}/{MAX_PROFILE_CHARS}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <footer className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => ImproveService.CloseProfile()}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={saving}>
          Salvar
        </Button>
      </footer>
    </main>
  );
}
