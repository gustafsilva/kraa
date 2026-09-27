import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ActionDTO } from "@bindings/github.com/gustavofreitas/kraa/internal/app";

export interface ActionListProps {
  actions: ActionDTO[];
  onSelectAction: (actionId: string) => void;
  /** Enter on the "Usar como instrução" item: the trimmed search text. */
  onFreeInstruction: (instruction: string) => void;
  /** Bumped by the caller to (re)focus the search input. */
  focusToken?: number;
  /**
   * Intercepts a keydown before cmdk's own root handler sees it — used by
   * the caller to steal ⌘/Ctrl+Enter for the global "Substituir" shortcut
   * instead of letting cmdk treat it as a plain Enter.
   */
  onKeyDownCapture?: (event: React.KeyboardEvent) => void;
  className?: string;
}

const FREE_VALUE = "__free-instruction__";

const GROUP_CLASS =
  "p-0 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:text-muted-foreground/80";

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ActionList({
  actions,
  onSelectAction,
  onFreeInstruction,
  focusToken,
  onKeyDownCapture,
  className,
}: ActionListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const instruction = query.trim();

  // Our own filter (cmdk's fuzzy ranking would reorder the free-instruction
  // item above real matches): actions keep config order, free item goes last.
  const groups = useMemo(() => {
    const needle = normalize(instruction);
    const byCategory = new Map<string, ActionDTO[]>();
    for (const action of actions) {
      if (needle && !normalize(`${action.label} ${action.category}`).includes(needle)) continue;
      const list = byCategory.get(action.category) ?? [];
      list.push(action);
      byCategory.set(action.category, list);
    }
    return Array.from(byCategory.entries());
  }, [actions, instruction]);

  const firstValue = groups[0]?.[1][0]?.id ?? (instruction ? FREE_VALUE : "");

  // Every time the visible list changes, highlight its first item so Enter
  // always does the most obvious thing.
  useEffect(() => {
    setSelected(firstValue);
  }, [firstValue, instruction]);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLInputElement>('[data-slot="command-input"]')
      ?.focus();
  }, [focusToken]);

  return (
    <div
      ref={containerRef}
      data-slot="action-list"
      className={cn("flex min-h-0 flex-col [--wails-draggable:no-drag]", className)}
      onKeyDownCapture={onKeyDownCapture}
    >
      <Command
        className="min-h-0 flex-1 bg-transparent p-0"
        shouldFilter={false}
        loop
        value={selected}
        onValueChange={setSelected}
        label="Buscar ação"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar ação ou instruir…"
          aria-label="Buscar ação"
          className="text-[13px]"
          wrapperClassName="p-0 *:data-[slot=input-group]:h-8! *:data-[slot=input-group]:rounded-lg! *:data-[slot=input-group]:border-transparent! *:data-[slot=input-group]:bg-transparent!"
        />
        <CommandList className="max-h-none min-h-0 flex-1 pt-1 [scrollbar-width:thin]">
          <CommandEmpty className="px-2 py-3 text-left text-[12px] text-muted-foreground">
            Digite o que deseja e aperte Enter.
          </CommandEmpty>
          {groups.map(([category, items]) => (
            <CommandGroup key={category} heading={category} className={GROUP_CLASS}>
              {items.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  onSelect={() => onSelectAction(action.id)}
                  className="group/item justify-between rounded-md px-2 py-1.5 text-[13px] text-foreground/75 *:[svg]:hidden data-selected:bg-pencil-wash data-selected:text-foreground"
                >
                  {action.label}
                  <span aria-hidden="true" className="hidden text-pencil group-data-selected/item:inline-flex">
                    <CornerDownLeft className="size-3.5" />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {instruction && (
            <CommandGroup heading="Instrução livre" className={GROUP_CLASS}>
              <CommandItem
                value={FREE_VALUE}
                onSelect={() => onFreeInstruction(instruction)}
                className="group/item items-start gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/75 *:[svg]:hidden data-selected:bg-pencil-wash data-selected:text-foreground"
              >
                <span aria-hidden="true" className="mt-0.5 inline-flex text-pencil">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <span className="text-muted-foreground">Usar como instrução: </span>
                  {instruction}
                </span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
