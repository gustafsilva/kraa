import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { ImproveService } from "@bindings/github.com/gustavofreitas/kraa/internal/app";
import type {
  ActionDTO,
  ChunkEvent,
  DoneEvent,
  ErrorEvent as ImproveErrorEvent,
  SelectionEvent,
  StartRequest,
  State,
} from "@bindings/github.com/gustavofreitas/kraa/internal/app";

export type ImproveStatus = "idle" | "streaming" | "done" | "error";

/** Max number of versions kept per session; oldest is dropped past this. */
const MAX_VERSIONS = 20;

/** One generated result in the current session's history. */
export interface Version {
  /** Editable text shown when this version is selected. */
  text: string;
  /** Original captured text (action/instruction) or the refined base (refine). */
  baseText: string;
  /** e.g. "Mais formal" | "Instrução: …" | "Refinar: …". */
  label: string;
  /** Request that produced this version (used by regenerate()). */
  request: StartRequest;
}

export interface ImproveState {
  /** Text sent to Start(): the captured selection, possibly edited by the user. */
  text: string;
  actions: ActionDTO[];
  canReplace: boolean;
  /** Why canReplace is false (or another session note), PT-BR. */
  warning: string;
  /** State.error — config/reload failure, shown as a persistent alert. */
  configError: string;
  status: ImproveStatus;
  output: string;
  /** improve:error message for the current/last request. */
  requestError: string;
  /** Replace()/Copy() rejection message (PT-BR), unrelated to the request stream. */
  actionError: string;
  /** provider.model currently in use (State.model). */
  model: string;
  /** Models offered by the provider (ListModels), sorted. */
  models: string[];
  /** ListModels/SetModel failure (PT-BR), shown next to the picker. */
  modelsError: string;
  /** True while SetModel is saving + reloading the config. */
  modelSaving: boolean;
  /** Versions of this session, oldest first (max MAX_VERSIONS). */
  versions: Version[];
  /** Index of the version on screen; -1 when there is none. */
  current: number;
}

export interface StartOptions {
  actionId?: string;
  freeInstruction?: string;
}

export interface UseImproveResult extends ImproveState {
  /** Bumped on every selection:new; use to (re)focus the action search. */
  selectionSeq: number;
  start: (opts: StartOptions) => void;
  /** Re-runs the last Start() request (used by the error "Tentar novamente" action). */
  retry: () => void;
  /** Lets the preview be edited once status is "done". */
  setOutput: (value: string) => void;
  /** Edits the text to improve (captured text or typed/pasted by the user). */
  setText: (value: string) => void;
  replace: () => Promise<void>;
  copy: () => Promise<void>;
  close: () => Promise<void>;
  /** Persists the chosen model (config.yaml); applies to the next request. */
  setModel: (model: string) => Promise<void>;
  /** The version at `current`, or null when there is none. */
  currentVersion: Version | null;
  /** Selects a version by index; a no-op while streaming or out of range. */
  selectVersion: (index: number) => void;
  /** Selects the previous version, if any. */
  prevVersion: () => void;
  /** Selects the next version, if any. */
  nextVersion: () => void;
  /** Improves the current version's (possibly hand-edited) text further. No-op without a current version or during a stream. */
  refine: (instruction: string) => void;
  /** Re-runs the current version's request as a variation. No-op without a current version or during a stream. */
  regenerate: () => void;
}

type BufferedEvent =
  | { type: "chunk"; id: string; payload: ChunkEvent }
  | { type: "done"; id: string; payload: DoneEvent }
  | { type: "error"; id: string; payload: ImproveErrorEvent };

/** Metadata for the in-flight request, used to build its Version on improve:done. */
interface PendingMeta {
  baseText: string;
  label: string;
}

const initialState: ImproveState = {
  text: "",
  actions: [],
  canReplace: true,
  warning: "",
  configError: "",
  status: "idle",
  output: "",
  requestError: "",
  actionError: "",
  model: "",
  models: [],
  modelsError: "",
  modelSaving: false,
  versions: [],
  current: -1,
};

/**
 * Bridges the ImproveService bindings + events to React state.
 *
 * Ruling R12: events for a new request can arrive before the Start()
 * promise resolves with its id (e.g. an immediate validation error). While a
 * Start is pending, every improve:* event is buffered in arrival order;
 * once Start resolves with the real id, buffered events matching that id are
 * replayed and the rest are dropped. Once resolved, any live event whose id
 * no longer matches the current request (e.g. a late chunk for an id that
 * was superseded by a subsequent Start) is ignored.
 *
 * Overlapping Start() calls: calling start() again before a previous Start()
 * promise has resolved must not let that older promise's resolution mutate
 * pending/current-id/buffer state once it finally settles — those belong to
 * whichever start() call is the latest, regardless of resolution order.
 * Each startWithRequest() run is tagged with a monotonically increasing
 * `generation`; a .then/.catch only touches pendingRef/currentIdRef/
 * bufferRef when its generation is still the latest one. A stale resolution
 * (an older generation) is a no-op for local state, but it does defensively
 * Cancel() its own id in case the backend hasn't already cancelled it.
 */
export function useImprove(): UseImproveResult {
  const [state, setState] = useState<ImproveState>(initialState);
  const [selectionSeq, setSelectionSeq] = useState(0);

  const currentIdRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const bufferRef = useRef<BufferedEvent[]>([]);
  const lastRequestRef = useRef<StartRequest | null>(null);
  const lastMetaRef = useRef<PendingMeta | null>(null);
  const generationRef = useRef(0);
  // True once the user edits the text; reset by selection:new (a new
  // capture). While true, GetState must not overwrite the edit.
  const textEditedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyBuffered = useCallback((evt: BufferedEvent) => {
    if (evt.type === "chunk") {
      setState((s) => ({ ...s, status: "streaming", output: s.output + evt.payload.delta }));
    } else if (evt.type === "done") {
      const meta = lastMetaRef.current;
      const request = lastRequestRef.current;
      setState((s) => {
        if (!meta || !request) return { ...s, status: "done", output: evt.payload.text };
        const version: Version = { text: evt.payload.text, baseText: meta.baseText, label: meta.label, request };
        const versions = [...s.versions, version].slice(-MAX_VERSIONS);
        return { ...s, status: "done", output: version.text, versions, current: versions.length - 1 };
      });
    } else {
      setState((s) => ({
        ...s,
        status: "error",
        requestError: evt.payload.message,
        output: s.versions[s.current]?.text ?? "",
      }));
    }
  }, []);

  const handleEvent = useCallback(
    (evt: BufferedEvent) => {
      if (pendingRef.current) {
        bufferRef.current.push(evt);
        return;
      }
      if (evt.id !== currentIdRef.current) return;
      applyBuffered(evt);
    },
    [applyBuffered]
  );

  const loadModels = useCallback(() => {
    ImproveService.ListModels()
      .then((models: string[] | null) => {
        setState((s) => ({ ...s, models: models ?? [], modelsError: "" }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, models: [], modelsError: message }));
      });
  }, []);

  useEffect(() => {
    const offChunk = Events.On("improve:chunk", (ev) => {
      const payload = ev.data as ChunkEvent;
      handleEvent({ type: "chunk", id: payload.id, payload });
    });
    const offDone = Events.On("improve:done", (ev) => {
      const payload = ev.data as DoneEvent;
      handleEvent({ type: "done", id: payload.id, payload });
    });
    const offError = Events.On("improve:error", (ev) => {
      const payload = ev.data as ImproveErrorEvent;
      handleEvent({ type: "error", id: payload.id, payload });
    });
    const offSelection = Events.On("selection:new", (ev) => {
      const payload = ev.data as SelectionEvent;
      // Invalidate any Start() still in flight so its eventual resolution
      // (or buffered events) can't resurrect state for a request this new
      // selection has made irrelevant.
      generationRef.current += 1;
      currentIdRef.current = null;
      pendingRef.current = false;
      bufferRef.current = [];
      lastRequestRef.current = null;
      lastMetaRef.current = null;
      textEditedRef.current = false;
      setState((s) => ({
        ...s,
        text: payload.text,
        canReplace: payload.canReplace,
        warning: payload.warning,
        status: "idle",
        output: "",
        requestError: "",
        actionError: "",
        versions: [],
        current: -1,
      }));
      setSelectionSeq((n) => n + 1);
      // Each modal opening refreshes the list (a model may have been pulled).
      loadModels();
    });
    // state:changed never touches `text`: the backend only changes its text
    // on a capture (Trigger), which is announced by selection:new, so the
    // `text` carried here is at best a stale copy and would clobber what the
    // user typed (e.g. state:changed from a config reload or tray toggle).
    const offStateChanged = Events.On("state:changed", (ev) => {
      const payload = ev.data as State;
      setState((s) => ({
        ...s,
        actions: payload.actions ?? [],
        canReplace: payload.canReplace,
        warning: payload.warning,
        configError: payload.error,
        model: payload.model,
      }));
    });

    ImproveService.GetState()
      .then((s: State) => {
        setState((prev) => ({
          ...prev,
          // Hydrates a capture that happened before this listener existed,
          // unless the user already started typing.
          text: textEditedRef.current ? prev.text : s.text,
          actions: s.actions ?? [],
          canReplace: s.canReplace,
          warning: s.warning,
          configError: s.error,
          model: s.model,
        }));
        loadModels();
      })
      .catch(() => {
        // GetState failures surface later via state:changed; nothing to do here.
      });

    return () => {
      offChunk();
      offDone();
      offError();
      offSelection();
      offStateChanged();
    };
  }, [handleEvent, loadModels]);

  const startWithRequest = useCallback(
    (req: StartRequest, meta: PendingMeta) => {
      lastRequestRef.current = req;
      lastMetaRef.current = meta;
      bufferRef.current = [];
      pendingRef.current = true;
      const generation = (generationRef.current += 1);
      setState((s) => ({ ...s, status: "streaming", output: "", requestError: "", actionError: "" }));

      ImproveService.Start(req)
        .then((id: string) => {
          if (generation !== generationRef.current) {
            // A newer start() call has superseded this one; pending/current/
            // buffer already belong to that newer generation. Don't touch
            // them — just make sure this id's request is actually cancelled.
            ImproveService.Cancel(id).catch(() => {});
            return;
          }
          currentIdRef.current = id;
          pendingRef.current = false;
          const buffered = bufferRef.current;
          bufferRef.current = [];
          for (const evt of buffered) {
            if (evt.id !== id) continue;
            applyBuffered(evt);
          }
        })
        .catch((err: unknown) => {
          if (generation !== generationRef.current) return;
          pendingRef.current = false;
          bufferRef.current = [];
          const message = err instanceof Error ? err.message : String(err);
          setState((s) => ({ ...s, status: "error", requestError: message, output: s.versions[s.current]?.text ?? "" }));
        });
    },
    [applyBuffered]
  );

  const start = useCallback(
    (opts: StartOptions) => {
      const s = stateRef.current;
      const req: StartRequest = {
        text: s.text,
        actionId: opts.actionId ?? "",
        freeInstruction: opts.freeInstruction ?? "",
        mode: "",
        previous: "",
      };
      const actionLabel = s.actions.find((a) => a.id === req.actionId)?.label;
      const label = actionLabel ?? `Instrução: ${req.freeInstruction}`;
      startWithRequest(req, { baseText: s.text, label });
    },
    [startWithRequest]
  );

  const refine = useCallback(
    (instruction: string) => {
      const s = stateRef.current;
      const cur = s.versions[s.current];
      if (!cur || s.status === "streaming") return;
      startWithRequest(
        { text: cur.text, actionId: "", freeInstruction: instruction, mode: "refine", previous: "" },
        { baseText: cur.text, label: `Refinar: ${instruction}` }
      );
    },
    [startWithRequest]
  );

  const regenerate = useCallback(() => {
    const s = stateRef.current;
    const cur = s.versions[s.current];
    if (!cur || s.status === "streaming") return;
    startWithRequest({ ...cur.request, mode: "variation", previous: cur.text }, { baseText: cur.baseText, label: cur.label });
  }, [startWithRequest]);

  const retry = useCallback(() => {
    if (lastRequestRef.current && lastMetaRef.current) {
      startWithRequest(lastRequestRef.current, lastMetaRef.current);
    }
  }, [startWithRequest]);

  const selectVersion = useCallback((index: number) => {
    setState((s) => {
      if (s.status === "streaming" || index < 0 || index >= s.versions.length) return s;
      return { ...s, current: index, output: s.versions[index].text };
    });
  }, []);

  const prevVersion = useCallback(() => selectVersion(stateRef.current.current - 1), [selectVersion]);
  const nextVersion = useCallback(() => selectVersion(stateRef.current.current + 1), [selectVersion]);

  const setOutput = useCallback((value: string) => {
    setState((s) => {
      if (s.current < 0) return { ...s, output: value };
      const versions = s.versions.map((v, i) => (i === s.current ? { ...v, text: value } : v));
      return { ...s, output: value, versions };
    });
  }, []);

  const setText = useCallback((value: string) => {
    textEditedRef.current = true;
    setState((s) => ({ ...s, text: value }));
  }, []);

  const replace = useCallback(async () => {
    setState((s) => ({ ...s, actionError: "" }));
    try {
      await ImproveService.Replace(stateRef.current.output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, actionError: message }));
    }
  }, []);

  const copy = useCallback(async () => {
    setState((s) => ({ ...s, actionError: "" }));
    try {
      await ImproveService.Copy(stateRef.current.output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, actionError: message }));
      return;
    }
    // Only give focus back to the source app once the clipboard write
    // actually succeeded — a failed Copy should leave the window open so
    // the user can see the error and retry.
    await ImproveService.Close();
  }, []);

  const close = useCallback(async () => {
    await ImproveService.Close();
  }, []);

  const setModel = useCallback(async (model: string) => {
    setState((s) => ({ ...s, modelSaving: true, modelsError: "" }));
    try {
      await ImproveService.SetModel(model);
      setState((s) => ({ ...s, model, modelSaving: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, modelSaving: false, modelsError: message }));
    }
  }, []);

  return {
    ...state,
    selectionSeq,
    start,
    retry,
    setOutput,
    setText,
    replace,
    copy,
    close,
    setModel,
    currentVersion: state.versions[state.current] ?? null,
    selectVersion,
    prevVersion,
    nextVersion,
    refine,
    regenerate,
  };
}
