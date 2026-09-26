import type { ReactNode } from "react"
import { CircleAlert, Info, Lightbulb, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

const variants = {
  note: { icon: Info, title: "Nota", className: "border-sky-400/25 bg-sky-400/[0.06] *:[svg]:text-sky-300" },
  tip: { icon: Lightbulb, title: "Dica", className: "border-brand/30 bg-brand/[0.07] *:[svg]:text-brand" },
  warning: { icon: TriangleAlert, title: "Atenção", className: "border-warning/30 bg-warning/[0.07] *:[svg]:text-warning" },
  danger: { icon: CircleAlert, title: "Cuidado", className: "border-destructive/30 bg-destructive/[0.07] *:[svg]:text-destructive" },
} as const

interface CalloutProps {
  type?: keyof typeof variants
  title?: string
  children?: ReactNode
}

/** Destaque dentro do texto das docs (shadcn Alert). */
export default function Callout({ type = "note", title, children }: CalloutProps) {
  const v = variants[type]
  const Icon = v.icon
  return (
    <Alert className={cn("my-6 rounded-xl px-4 py-3", v.className)}>
      <Icon />
      <AlertTitle className="text-foreground">{title ?? v.title}</AlertTitle>
      <AlertDescription className="text-foreground/80 [&_p]:my-1.5 [&_pre]:my-3">{children}</AlertDescription>
    </Alert>
  )
}
