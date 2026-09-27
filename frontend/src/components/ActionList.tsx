import { useEffect, useMemo, useRef } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ActionDTO } from "@bindings/github.com/gustavofreitas/kraa/internal/app";

interface ActionListProps {
  actions: ActionDTO[];
  onSelectAction: (actionId: string) => void;
  /** Bumped by the caller (selectionSeq) to (re)focus the search input. */
  focusToken?: number;
  /**
   * Intercepts a keydown before cmdk's own root handler sees it — used by
   * the caller to steal ⌘/Ctrl+Enter for the global "Substituir" shortcut
   * instead of letting cmdk treat it as a plain Enter (which would select
   * the highlighted action and call Start()).
   */
  onKeyDownCapture?: (event: React.KeyboardEvent) => void;
}

export function ActionList({ actions, onSelectAction, focusToken, onKeyDownCapture }: ActionListProps) {
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
    <div
      ref={containerRef}
      className="flex max-h-[34%] min-h-20 shrink-0 [--wails-draggable:no-drag]"
      onKeyDownCapture={onKeyDownCapture}
    >
      <Command className="flex-1 bg-transparent p-0" shouldFilter label="Buscar ação">
        <CommandInput
          placeholder="Buscar ação…"
          aria-label="Buscar ação"
          className="text-[13px]"
          wrapperClassName="p-0 *:data-[slot=input-group]:h-8.5! *:data-[slot=input-group]:rounded-full! *:data-[slot=input-group]:pl-1"
        />
        <CommandList className="max-h-none flex-1 pt-2.5 pb-2 [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,black_calc(100%-14px),transparent)]">
          <CommandEmpty className="py-3 text-left text-[13px] text-muted-foreground">
            Nenhuma ação encontrada. Descreva o que deseja na instrução livre.
          </CommandEmpty>
          {groups.map(([category, items]) => (
            <CommandGroup
              key={category}
              heading={category}
              className="flex items-start gap-3 p-0 pb-1.5 **:[[cmdk-group-heading]]:w-18 **:[[cmdk-group-heading]]:shrink-0 **:[[cmdk-group-heading]]:truncate **:[[cmdk-group-heading]]:px-0 **:[[cmdk-group-heading]]:pt-1.5 **:[[cmdk-group-heading]]:pb-0 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-items]]:flex **:[[cmdk-group-items]]:flex-1 **:[[cmdk-group-items]]:flex-wrap **:[[cmdk-group-items]]:gap-1.5"
            >
              {items.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${category}`}
                  onSelect={() => onSelectAction(action.id)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-[13px] transition-colors hover:border-foreground/20 data-selected:border-pencil/60 data-selected:bg-pencil-wash data-selected:text-accent-foreground *:[svg]:hidden"
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
