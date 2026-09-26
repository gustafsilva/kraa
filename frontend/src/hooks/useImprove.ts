import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { ImproveService } from "@bindings/github.com/gustavofreitas/prompt-improve/internal/app";
import type {
  ActionDTO,
  ChunkEvent,
  DoneEvent,
  ErrorEvent as ImproveErrorEvent,
  SelectionEvent,
  StartRequest,
  State,
} from "@bindings/github.com/gustavofreitas/prompt-improve/internal/app";

export type ImproveStatus = "idle" | "streaming" | "done" | "error";

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
}

type BufferedEvent =
  | { type: "chunk"; id: string; payload: ChunkEvent }
  | { type: "done"; id: string; payload: DoneEvent }
  | { type: "error"; id: string; payload: ImproveErrorEvent };

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
      setState((s) => ({ ...s, status: "done", output: evt.payload.text }));
    } else {
      setState((s) => ({ ...s, status: "error", requestError: evt.payload.message }));
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
      }));
      setSelectionSeq((n) => n + 1);
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
        }));
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
  }, [handleEvent]);

  const startWithRequest = useCallback(
    (req: StartRequest) => {
      lastRequestRef.current = req;
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
          setState((s) => ({ ...s, status: "error", requestError: message }));
        });
    },
    [applyBuffered]
  );

  const start = useCallback(
    (opts: StartOptions) => {
      const req: StartRequest = {
        text: stateRef.current.text,
        actionId: opts.actionId ?? "",
        freeInstruction: opts.freeInstruction ?? "",
      };
      startWithRequest(req);
    },
    [startWithRequest]
  );

  const retry = useCallback(() => {
    if (lastRequestRef.current) startWithRequest(lastRequestRef.current);
  }, [startWithRequest]);

  const setOutput = useCallback((value: string) => {
    setState((s) => ({ ...s, output: value }));
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
  };
}
