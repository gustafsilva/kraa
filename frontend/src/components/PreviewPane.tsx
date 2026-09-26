import { Textarea } from "@/components/ui/textarea";

interface PreviewPaneProps {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  placeholder?: string;
}

/** Streaming/result preview. Read-only while streaming; editable once done. */
export function PreviewPane({ value, onChange, editable, placeholder }: PreviewPaneProps) {
  return (
    <Textarea
      className="min-h-0 flex-1 resize-none [--wails-draggable:no-drag]"
      value={value}
      readOnly={!editable}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label="Pré-visualização"
    />
  );
}
