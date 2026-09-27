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
    <div className="group/preview relative -ml-3 flex min-h-0 flex-1 flex-col gap-1 pl-3">
      {/* Blue-pencil rule: marks the revised text, mirroring the graphite rule of the source. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 rounded-full transition-all group-focus-within/preview:w-[3px]",
          streaming || hasResult ? "bg-pencil" : "bg-graphite",
          streaming && "pencil-writing",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">Resultado</span>
        {streaming && <span className="text-[11px] text-pencil">Escrevendo…</span>}
      </div>
      <Textarea
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent [--wails-draggable:no-drag]"
        value={value}
        readOnly={!editable}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Pré-visualização"
      />
      {mascot && value.length === 0 && (
        <Mascot key={mascot} pose={mascot} size={52} className="absolute right-0 bottom-0 opacity-90" />
      )}
    </div>
  );
}
