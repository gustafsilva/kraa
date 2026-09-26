import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Caixa com um comando de terminal e botão de copiar. */
export default function CopyCommand({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      className={cn(
        "flex h-11 w-full max-w-lg items-center text-left gap-3 rounded-xl border bg-card/70 pr-1.5 pl-4 font-mono text-[0.82rem] shadow-sm backdrop-blur",
        className
      )}
    >
      <span className="text-brand select-none">$</span>
      <code className="min-w-0 flex-1 truncate text-foreground/90">{command}</code>
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={copied ? "Copiado" : "Copiar comando"}>
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  )
}
