import { expect, type APIRequestContext } from "@playwright/test";
import { KRAA_URL, LLM_URL, writeConfig } from "./env";

export interface LlmRequest {
  model: string;
  messages: { role: string; content: string }[];
  canceled: boolean;
}

export interface Scenario {
  chunks?: string[];
  chunkDelayMs?: number;
  status?: number;
  message?: string;
  hang?: boolean;
  modelsStatus?: number;
  modelsMessage?: string;
}

export interface E2EState {
  clipboard: string;
  hasClipboard: boolean;
  pasted: string[];
  window: { visible: boolean; shows: number; hides: number };
  profileWindow: { visible: boolean; shows: number; hides: number };
}

async function ok(res: Promise<{ ok(): boolean; status(): number }>) {
  const r = await res;
  expect(r.ok(), `status ${r.status()}`).toBeTruthy();
}

export async function resetAll(request: APIRequestContext) {
  writeConfig(); // desfaz modelo/perfil gravados por testes anteriores
  await ok(request.post(`${LLM_URL}/__control/reset`));
  await ok(request.post(`${KRAA_URL}/__e2e/reset`)); // também recarrega o config.yaml
}

export const setScenario = (request: APIRequestContext, s: Scenario) => ok(request.post(`${LLM_URL}/__control/scenario`, { data: s }));

export async function llmRequests(request: APIRequestContext): Promise<LlmRequest[]> {
  return (await request.get(`${LLM_URL}/__control/requests`)).json();
}

const selectionBody = (selection?: string) => ({ data: selection === undefined ? {} : { selection } });

/** Opens the modal the way Host.Trigger does (simulated selection capture). */
export const trigger = (request: APIRequestContext, selection?: string) =>
  ok(request.post(`${KRAA_URL}/__e2e/trigger`, selectionBody(selection)));

/** Fires the callback the Reloader registered for the global hotkey. */
export const hotkey = (request: APIRequestContext, selection?: string) =>
  ok(request.post(`${KRAA_URL}/__e2e/hotkey`, selectionBody(selection)));

export const setSession = (request: APIRequestContext, canReplace: boolean, reason = "") =>
  ok(request.post(`${KRAA_URL}/__e2e/session`, { data: { canReplace, reason } }));

export const setClipboard = (request: APIRequestContext, text: string) =>
  ok(request.post(`${KRAA_URL}/__e2e/clipboard`, { data: { text } }));

export async function e2eState(request: APIRequestContext): Promise<E2EState> {
  return (await request.get(`${KRAA_URL}/__e2e/state`)).json();
}

export const allContent = (r: LlmRequest) => r.messages.map((m) => m.content).join("\n");
