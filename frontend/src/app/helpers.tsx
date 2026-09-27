import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect } from "vitest";

import { emit } from "../test/wailsRuntimeMock";
import { ImproveService } from "../test/improveServiceMock";
import App from "../App";

/** Shared fixtures/helpers for the <App /> test suite (split by describe, see src/app/*.test.tsx). */

export const actions = [
  { id: "a1", category: "Tom", label: "Deixar formal" },
  { id: "a2", category: "Tom", label: "Deixar casual" },
  { id: "b1", category: "Gramática", label: "Corrigir erros" },
];

export function mockState(
  overrides: Partial<{
    text: string;
    actions: typeof actions;
    canReplace: boolean;
    warning: string;
    error: string;
    model: string;
  }> = {}
) {
  return {
    text: "Texto capturado de teste",
    actions,
    canReplace: true,
    warning: "",
    error: "",
    model: "llama3.2:latest",
    ...overrides,
  };
}

export async function renderAppHydrated(state = mockState()) {
  ImproveService.GetState.mockResolvedValueOnce(state);
  render(<App />);
  await waitFor(() => expect(ImproveService.GetState).toHaveBeenCalled());
  await screen.findByText(state.actions[0]?.label ?? "");
  return state;
}

// improve:done flips resultReady, which makes Footer's own effect steal
// focus (button.focus()) onto Substituir/Copiar. If the cmdk search input
// still has focus at that point, the resulting blur is handled by cmdk's own
// internal (imperative) focus bookkeeping in a way that escapes this act()
// call's flush — React then warns about the *later* Footer state update
// (onFocus) as "not wrapped in act()", even though it happens inside this
// callback. Blurring whatever is currently focused first (itself wrapped in
// act()) avoids that cmdk interaction entirely, at the cost of collapsing
// App.tsx's `!active || active === document.body ||
// active.closest('[data-slot="action-list"]')` focus-effect condition
// (App.tsx:100) down to just its first two branches for every test that
// calls this — the cmdk-search branch (a real, keyboard-only user who never
// left the search box) is deliberately NOT exercised by any test that uses
// this helper. src/app/keyboard.test.tsx has one dedicated test that skips
// this helper and instead contains the resulting warning with a scoped,
// message-filtered console.error spy, to keep that branch covered without
// it (see that test's comment).
export function blurActiveElement() {
  (document.activeElement as HTMLElement | null)?.blur();
}

/** Runs Start + improve:done so `output`/canReplace are ready for shortcut tests. */
export async function produceOutput(text = "Resultado final.") {
  ImproveService.Start.mockResolvedValueOnce("req-1");
  const search = screen.getByRole("combobox", { name: /buscar ação/i });
  await userEvent.setup().type(search, "Corrigir{Enter}");
  await waitFor(() => expect(ImproveService.Start).toHaveBeenCalledTimes(1));
  act(blurActiveElement);
  act(() => {
    emit("improve:done", { id: "req-1", text });
  });
  await screen.findByDisplayValue(text);
}
