import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

interface ModelPickerProps {
  model: string;
  models: string[];
  /** ListModels/SetModel failure (PT-BR). */
  error: string;
  disabled: boolean;
  onChange: (model: string) => void;
}

export function ModelPicker({ model, models, error, disabled, onChange }: ModelPickerProps) {
  // The configured model stays selectable even when the provider doesn't
  // list it (e.g. "llama3.2" vs Ollama's "llama3.2:latest") or listing failed.
  const options = model && !models.includes(model) ? [model, ...models] : models;

  return (
    <div className="flex min-w-0 items-center gap-2 [--wails-draggable:no-drag]">
      <NativeSelect
        size="sm"
        aria-label="Modelo"
        value={model}
        disabled={disabled || options.length === 0}
        onChange={(event) => {
          if (event.target.value !== model) onChange(event.target.value);
        }}
        className="max-w-56 shrink-0 text-xs"
      >
        {options.map((m) => (
          <NativeSelectOption key={m} value={m}>
            {m}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {error && (
        <span role="status" title={error} className="min-w-0 truncate text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
