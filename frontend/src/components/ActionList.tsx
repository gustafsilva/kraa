import { useEffect, useMemo, useRef } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ActionDTO } from "@bindings/github.com/gustavofreitas/prompt-improve/internal/app";

interface ActionListProps {
  actions: ActionDTO[];
  onSelectAction: (actionId: string) => void;
  /** Bumped by the caller (selectionSeq) to (re)focus the search input. */
  focusToken?: number;
}

export function ActionList({ actions, onSelectAction, focusToken }: ActionListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const byCategory = new Map<string, ActionDTO[]>();
    for (const action of actions) {
      const list = byCategory.get(action.category) ?? [];
      list.push(action);
      byCategory.set(action.category, list);
    }
    return Array.from(byCategory.entries());
  }, [actions]);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLInputElement>('[data-slot="command-input"]')
      ?.focus();
  }, [focusToken]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 [--wails-draggable:no-drag]">
      <Command className="flex-1 rounded-lg border" shouldFilter label="Buscar ação">
        <CommandInput placeholder="Buscar ação…" aria-label="Buscar ação" />
        <CommandList className="max-h-none flex-1">
          <CommandEmpty>Nenhuma ação encontrada.</CommandEmpty>
          {groups.map(([category, items]) => (
            <CommandGroup key={category} heading={category}>
              {items.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${category}`}
                  onSelect={() => onSelectAction(action.id)}
                >
                  {action.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
