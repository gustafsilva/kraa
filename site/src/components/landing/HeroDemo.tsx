import { useEffect, useState } from "react"
import { ChevronDown, CornerDownLeft, Search, Sparkles, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

const ACTIONS = [
  { id: "improve-prompt", category: "Prompt", label: "Melhorar prompt" },
  { id: "more-specific", category: "Prompt", label: "Mais específico" },
  { id: "formal", category: "Mensagem", label: "Mais formal" },
  { id: "shorter", category: "Mensagem", label: "Mais curto" },
  { id: "to-english", category: "Mensagem", label: "Traduzir para inglês" },
]

const SCENARIOS = [
  {
    source: "oi, vc consegue me mandar o relatorio ate amanha? preciso apresentar na reuniao",
    action: "formal",
    output:
      "Olá! Poderia, por gentileza, me enviar o relatório até amanhã? Preciso apresentá-lo na reunião. Obrigado desde já.",
  },
  {
    source: "escreve um post sobre ia pra pequenas empresas",
    action: "improve-prompt",
    output:
      "Escreva um post de blog (~600 palavras) sobre como pequenas empresas podem adotar IA generativa. Público: gestores não técnicos. Tom: prático e otimista. Inclua 3 exemplos concretos e termine com um checklist de primeiros passos.",
  },
  {
    source: "A gente precisa alinhar os próximos passos do projeto antes de sexta.",
    action: "to-english",
    output: "We need to align on the project's next steps before Friday.",
  },
]

type Phase = "pick" | "stream" | "done"

/** Maquete animada do modal: escolhe uma ação, faz o stream e oferece Substituir/Copiar. */
export default function HeroDemo() {
  const [scenario, setScenario] = useState(0)
  const [phase, setPhase] = useState<Phase>("pick")
  const [cursor, setCursor] = useState(0)
  const [chars, setChars] = useState(0)
  const [reduced, setReduced] = useState(false)

  const s = SCENARIOS[scenario]
  const target = ACTIONS.findIndex((a) => a.id === s.action)

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    if (reduced) {
      setCursor(target)
      setChars(s.output.length)
      setPhase("done")
      return
    }
    let t: ReturnType<typeof setTimeout>
    if (phase === "pick") {
      if (cursor !== target) {
        t = setTimeout(() => setCursor((c) => c + (c < target ? 1 : -1)), 260)
      } else {
        t = setTimeout(() => setPhase("stream"), 520)
      }
    } else if (phase === "stream") {
      if (chars < s.output.length) {
        t = setTimeout(() => setChars((n) => Math.min(n + 2, s.output.length)), 22)
      } else {
        t = setTimeout(() => setPhase("done"), 150)
      }
    } else {
      t = setTimeout(() => {
        setScenario((i) => (i + 1) % SCENARIOS.length)
        setChars(0)
        setPhase("pick")
      }, 2600)
    }
    return () => clearTimeout(t)
  }, [phase, cursor, chars, target, s.output.length, reduced])

  const streaming = phase === "stream"
  const done = phase === "done"
  let lastCategory = ""

  return (
    <div className="relative mx-auto w-full max-w-[34rem] text-left" aria-label="Demonstração do modal do Prompt Improve" role="img">
      <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,oklch(0.6_0.18_290/0.28),transparent)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/90 shadow-2xl shadow-black/60 ring-1 ring-black/40 backdrop-blur-xl">
        {/* Cabeçalho do modal */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-[0.8rem] font-medium">Prompt Improve</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-background/60 px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
              llama3.2 <ChevronDown className="size-3" />
            </span>
          </div>
          <X className="size-3.5 text-muted-foreground" />
        </div>

        <div className="space-y-3 p-3.5">
          <div>
            <p className="mb-1 text-[0.7rem] font-medium text-foreground/70">Texto a melhorar</p>
            <div key={scenario} className="animate-in fade-in rounded-lg border border-white/[0.08] bg-background/50 px-2.5 py-2 text-[0.78rem] leading-5 text-foreground/80 duration-500">
              {s.source}
            </div>
          </div>

          <div className="grid grid-cols-[11rem_1fr] gap-3 max-sm:grid-cols-1">
            {/* Lista de ações */}
            <div className="rounded-lg border border-white/[0.08] bg-background/40 p-1.5">
              <div className="mb-1 flex items-center gap-1.5 px-1.5 py-1 text-[0.7rem] text-muted-foreground">
                <Search className="size-3" /> Buscar ação…
              </div>
              {ACTIONS.map((a, i) => {
                const header = a.category !== lastCategory
                lastCategory = a.category
                const active = i === cursor
                return (
                  <div key={a.id}>
                    {header && (
                      <p className="px-1.5 pt-1.5 pb-0.5 text-[0.62rem] font-medium tracking-wide text-muted-foreground/70 uppercase">
                        {a.category}
                      </p>
                    )}
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-md px-1.5 py-1 text-[0.74rem] transition-colors duration-200",
                        active ? "bg-brand/15 text-foreground" : "text-foreground/70"
                      )}
                    >
                      {a.label}
                      {active && <CornerDownLeft className="size-3 text-brand" />}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Preview em stream */}
            <div className="flex min-h-44 flex-col rounded-lg border border-white/[0.08] bg-background/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[0.7rem] font-medium text-foreground/70">Resultado</span>
                {streaming && (
                  <Badge variant="outline" className="h-4 gap-1 border-brand/30 px-1.5 text-[0.6rem] text-brand">
                    <Sparkles /> gerando
                  </Badge>
                )}
              </div>
              <p className="text-[0.78rem] leading-5 text-foreground/90">
                {s.output.slice(0, chars)}
                {streaming && <span className="ml-px inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-brand" />}
                {phase === "pick" && <span className="text-muted-foreground/60">Escolha uma ação ou digite uma instrução.</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-3.5 py-2.5">
          <Button tabIndex={-1} variant="outline" size="sm" className="pointer-events-none h-7 text-[0.74rem]" disabled={!done}>
            Copiar
            <KbdGroup>
              <Kbd className="h-4 min-w-4 text-[0.6rem]">⌘⇧C</Kbd>
            </KbdGroup>
          </Button>
          <Button
            tabIndex={-1}
            size="sm"
            className={cn(
              "pointer-events-none h-7 text-[0.74rem] transition-shadow duration-500",
              done && "shadow-[0_0_0_4px_oklch(0.76_0.14_290/0.25)]"
            )}
            disabled={!done}
          >
            Substituir
            <Kbd className="h-4 min-w-4 bg-primary-foreground/10 text-[0.6rem] text-primary-foreground/70">⌘↵</Kbd>
          </Button>
        </div>
      </div>
    </div>
  )
}
