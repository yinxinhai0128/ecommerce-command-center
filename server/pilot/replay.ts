import type { PilotReplayState } from './contracts';

export type ReplayStateStore = {
  readReplayState(): PilotReplayState | undefined;
  writeReplayState(state: PilotReplayState): void;
};

type Scheduler = {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
};

export type PilotReplayController = {
  getState(): PilotReplayState;
  start(): PilotReplayState;
  pause(): PilotReplayState;
  reset(): PilotReplayState;
  dispose(): void;
};

type ReplayOptions = {
  store: ReplayStateStore;
  range: { start: string; end: string };
  scheduler?: Scheduler;
  tickMs?: number;
  stepHours?: number;
  wallNow?: () => Date;
};

function toDate(value: string) {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

function formatSourceLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function createReplayController({
  store,
  range,
  scheduler = {
    setInterval: (callback: () => void, milliseconds: number) => globalThis.setInterval(callback, milliseconds),
    clearInterval: (handle: unknown) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  },
  tickMs = 3_000,
  stepHours = 6,
  wallNow = () => new Date(),
}: ReplayOptions): PilotReplayController {
  void wallNow;
  const initialTime = (() => {
    const thirtyDaysAfterStart = new Date(toDate(range.start).getTime() + 30 * 86_400_000);
    return thirtyDaysAfterStart >= toDate(range.end) ? range.end : formatSourceLocal(thirtyDaysAfterStart);
  })();
  let state = store.readReplayState() ?? { sourceLocalNow: initialTime, isRunning: false };
  let timer: unknown;

  const persist = () => {
    store.writeReplayState(state);
    return state;
  };

  const stopTimer = () => {
    if (timer !== undefined) {
      scheduler.clearInterval(timer);
      timer = undefined;
    }
  };

  const tick = () => {
    if (!state.isRunning) return;
    const next = new Date(toDate(state.sourceLocalNow).getTime() + stepHours * 3_600_000);
    const end = toDate(range.end);
    if (next >= end) {
      state = { sourceLocalNow: range.end, isRunning: false };
      stopTimer();
    } else {
      state = { sourceLocalNow: formatSourceLocal(next), isRunning: true };
    }
    persist();
  };

  if (state.sourceLocalNow >= range.end) {
    state = { sourceLocalNow: range.end, isRunning: false };
    persist();
  } else if (state.isRunning) {
    timer = scheduler.setInterval(tick, tickMs);
  }

  return {
    getState: () => state,
    start() {
      if (state.sourceLocalNow >= range.end) state = { sourceLocalNow: range.end, isRunning: false };
      else state = { ...state, isRunning: true };
      if (state.isRunning && timer === undefined) timer = scheduler.setInterval(tick, tickMs);
      return persist();
    },
    pause() {
      stopTimer();
      state = { ...state, isRunning: false };
      return persist();
    },
    reset() {
      stopTimer();
      state = { sourceLocalNow: initialTime, isRunning: false };
      return persist();
    },
    dispose: stopTimer,
  };
}
