import { useEffect, useRef, useState } from "react";
import { Wand2 } from "lucide-react";

export interface RefineInputProps {
  /** Receives the trimmed instruction; never called with an empty string. */
  onSubmit: (instruction: string) => void;
  disabled?: boolean;
  /** Bumped by the caller to focus the field (⌘/Ctrl+L). */
  focusToken?: number;
}

/** "Refinar" field at the foot of the result card: applies an adjustment to the current version. */
export function RefineInput({ onSubmit, disabled = false, focusToken }: RefineInputProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusToken) ref.current?.focus();
  }, [focusToken]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    const instruction = value.trim();
    if (!instruction) return;
    onSubmit(instruction);
    setValue("");
  }

  return (
    <label className="flex items-center gap-2 border-t border-dashed pt-2 text-muted-foreground [--wails-draggable:no-drag]">
      <Wand2 className="size-3.5 shrink-0" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        aria-label="Refinar"
        placeholder="Refinar: ex. mais direto, sem emojis"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
      />
    </label>
  );
}
