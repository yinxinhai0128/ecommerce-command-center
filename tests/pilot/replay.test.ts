import { describe, expect, test } from 'vitest';
import { createReplayController, type ReplayStateStore } from '../../server/pilot/replay';

type ScheduledTask = () => void;

function createScheduler() {
  let task: ScheduledTask | undefined;
  return {
    setInterval(callback: ScheduledTask) {
      task = callback;
      return 1;
    },
    clearInterval() {
      task = undefined;
    },
    tick() {
      task?.();
    },
  };
}

function createStore(): ReplayStateStore {
  let state: ReturnType<ReplayStateStore['readReplayState']>;
  return {
    readReplayState: () => state,
    writeReplayState: (next) => { state = next; },
  };
}

describe('createReplayController', () => {
  test('每次 tick 推进六个源数据本地小时并持久化状态', () => {
    const store = createStore();
    const scheduler = createScheduler();
    const replay = createReplayController({
      store,
      scheduler,
      tickMs: 3_000,
      stepHours: 6,
      wallNow: () => new Date('2026-08-09T00:00:00.000Z'),
      range: { start: '2017-01-31 00:00:00', end: '2017-01-31 18:00:00' },
    });

    replay.start();
    scheduler.tick();

    expect(replay.getState()).toMatchObject({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: true });
    expect(store.readReplayState()).toMatchObject({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: true });
    replay.dispose();
  });

  test('暂停会阻止后续 tick，重置恢复到初始时刻', () => {
    const scheduler = createScheduler();
    const replay = createReplayController({
      store: createStore(),
      scheduler,
      range: { start: '2017-01-31 00:00:00', end: '2017-01-31 18:00:00' },
    });

    replay.start();
    scheduler.tick();
    const beforePause = replay.pause().sourceLocalNow;
    scheduler.tick();

    expect(replay.getState().sourceLocalNow).toBe(beforePause);
    expect(replay.reset().sourceLocalNow).toBe('2017-01-31 00:00:00');
    replay.dispose();
  });

  test('到达数据集末尾时会自动暂停', () => {
    const scheduler = createScheduler();
    const replay = createReplayController({
      store: createStore(),
      scheduler,
      stepHours: 6,
      range: { start: '2017-01-31 00:00:00', end: '2017-01-31 06:00:00' },
    });

    replay.start();
    scheduler.tick();

    expect(replay.getState()).toMatchObject({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: false });
    replay.dispose();
  });
});
