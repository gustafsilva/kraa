import { Kbd as UiKbd, KbdGroup } from "@/components/ui/kbd"

/** Atalho de teclado: `<Kbd keys={["⌘", "Enter"]} />`. */
export default function Kbd({ keys }: { keys: string[] }) {
  return (
    <KbdGroup className="align-middle">
      {keys.map((k) => (
        <UiKbd key={k} className="border border-border bg-muted/70 font-mono text-[0.75rem] text-foreground/90">
          {k}
        </UiKbd>
      ))}
    </KbdGroup>
  )
}
