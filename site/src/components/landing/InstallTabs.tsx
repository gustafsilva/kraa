import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import CopyCommand from "./CopyCommand"

const METHODS = [
  { value: "npm", label: "npm", command: "npm i -g kraa && kraa start", note: "macOS, Windows e Linux · Node 18+" },
  {
    value: "sh",
    label: "macOS / Linux",
    command: "curl -fsSL https://raw.githubusercontent.com/gustafsilva/kraa/main/scripts/install.sh | sh",
    note: "Sem Node · baixa o último release e confere o SHA-256",
  },
  {
    value: "ps",
    label: "Windows",
    command: "irm https://raw.githubusercontent.com/gustafsilva/kraa/main/scripts/install.ps1 | iex",
    note: "PowerShell · sem Node",
  },
]

export default function InstallTabs() {
  return (
    <Tabs defaultValue="npm" className="items-center gap-4">
      <TabsList>
        {METHODS.map((m) => (
          <TabsTrigger key={m.value} value={m.value} className="px-3">
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {METHODS.map((m) => (
        <TabsContent key={m.value} value={m.value} className="flex w-full flex-col items-center gap-2">
          <CopyCommand command={m.command} className="max-w-2xl" />
          <p className="text-xs text-muted-foreground">{m.note}</p>
        </TabsContent>
      ))}
    </Tabs>
  )
}
