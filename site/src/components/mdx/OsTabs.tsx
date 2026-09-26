import type { ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const OS = [
  { value: "macos", label: "macOS" },
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
] as const

type OsValue = (typeof OS)[number]["value"]

/**
 * Abas por sistema operacional. No MDX, cada aba é um slot nomeado:
 * `<OsTabs client:load><div slot="macos">...</div></OsTabs>`.
 * Abas sem conteúdo não aparecem.
 */
export default function OsTabs(props: Partial<Record<OsValue, ReactNode>>) {
  const tabs = OS.filter((os) => props[os.value])
  const initial = detectOs(tabs.map((t) => t.value))
  return (
    <Tabs defaultValue={initial} className="my-6">
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="px-3">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="text-[0.95rem] [&_pre]:mt-3">
          {props[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function detectOs(available: OsValue[]): OsValue {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent
    const guess: OsValue = /Mac/i.test(ua) ? "macos" : /Win/i.test(ua) ? "windows" : "linux"
    if (available.includes(guess)) return guess
  }
  return available[0]
}
