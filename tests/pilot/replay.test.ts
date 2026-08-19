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

function createStore(initial?: ReturnType<ReplayStateStore['readReplayState']>): ReplayStateStore {
  let state = initial;
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
      range: { start: '2017-01-31 00:00:00', end: '2017-03-05 18:00:00' },
    });

    replay.start();
    scheduler.tick();

    expect(replay.getState()).toMatchObject({ sourceLocalNow: '2017-03-02 06:00:00', isRunning: true });
    expect(store.readReplayState()).toMatchObject({ sourceLocalNow: '2017-03-02 06:00:00', isRunning: true });
    replay.dispose();
  });

  test('暂停会阻止后续 tick，重置恢复到初始时刻', () => {
    const scheduler = createScheduler();
    const replay = createReplayController({
      store: createStore(),
      scheduler,
      range: { start: '2017-01-31 00:00:00', end: '2017-03-05 18:00:00' },
    });

    replay.start();
    scheduler.tick();
    const beforePause = replay.pause().sourceLocalNow;
    scheduler.tick();

    expect(replay.getState().sourceLocalNow).toBe(beforePause);
    expect(replay.reset().sourceLocalNow).toBe('2017-03-02 00:00:00');
    replay.dispose();
  });

  test('从运行中的持久化状态重建时恢复 interval', () => {
    const scheduler = createScheduler();
    const store = createStore({ sourceLocalNow: '2017-01-31 00:00:00', isRunning: true });
    const replay = createReplayController({
      store,
      scheduler,
      stepHours: 6,
      range: { start: '2017-01-01 00:00:00', end: '2017-02-28 00:00:00' },
    });

    scheduler.tick();

    expect(replay.getState()).toEqual({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: true });
    replay.dispose();
  });

  test('重建时将到达数据末尾的运行状态规范为暂停', () => {
    const store = createStore({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: true });
    const replay = createReplayController({
      store,
      scheduler: createScheduler(),
      range: { start: '2017-01-31 00:00:00', end: '2017-01-31 06:00:00' },
    });

    expect(replay.getState()).toEqual({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: false });
    expect(store.readReplayState()).toEqual({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: false });
    replay.dispose();
  });

  test('短数据范围重置时将初始点封顶为数据集末尾', () => {
    const replay = createReplayController({
      store: createStore(),
      scheduler: createScheduler(),
      range: { start: '2017-01-31 00:00:00', end: '2017-01-31 06:00:00' },
    });

    expect(replay.reset()).toEqual({ sourceLocalNow: '2017-01-31 06:00:00', isRunning: false });
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
