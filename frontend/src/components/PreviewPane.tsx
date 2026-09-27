import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Mascot, type MascotPose } from "@/components/Mascot";

interface PreviewPaneProps {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  /** True while the model is still writing; the pencil rule breathes. */
  streaming?: boolean;
  placeholder?: string;
  /** Kraa pose shown in the corner while there is no result yet (null: none). */
  mascot?: MascotPose | null;
}

/** Streaming/result preview. Read-only while streaming; editable once done. */
export function PreviewPane({
  value,
  onChange,
  editable,
  streaming = false,
  placeholder,
  mascot = null,
}: PreviewPaneProps) {
  const hasResult = value.trim().length > 0;
  return (
    <div
      data-slot="preview-card"
      className={cn(
        "group/preview relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-xl border bg-card/60 py-2.5 pr-3 pl-4 transition-colors",
        (streaming || hasResult) && "border-pencil/25",
      )}
    >
      {/* Blue-pencil rule: marks the revised text, mirroring the graphite rule of the source. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-3 left-1.5 w-0.5 rounded-full transition-all group-focus-within/preview:w-[3px]",
          streaming || hasResult ? "bg-pencil" : "bg-graphite",
          streaming && "pencil-writing",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">Resultado</span>
        {streaming && (
          <span className="inline-flex items-center gap-1 rounded-full border border-pencil/30 px-1.5 py-px text-[10px] text-pencil">
            <Sparkles className="size-3" aria-hidden="true" />
            Escrevendo…
          </span>
        )}
      </div>
      <Textarea
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[14px] dark:bg-transparent [--wails-draggable:no-drag]"
        value={value}
        readOnly={!editable}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Pré-visualização"
      />
      {mascot && value.length === 0 && (
        <Mascot key={mascot} pose={mascot} size={52} className="absolute right-2 bottom-2 opacity-90" />
      )}
    </div>
  );
}
