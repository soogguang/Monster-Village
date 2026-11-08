import { describe, expect, it } from 'vitest';
import { GameStore, normalizeState, type Storage } from '../store';
import { chooseStartState } from './cloudSave';

const MINUTE = 60 * 1000;
const T0 = Date.UTC(2026, 10, 8, 9);

describe('접속할 때 어느 데이터로 시작할지', () => {
  it('서버에 아직 없으면 이 브라우저 데이터로 시작하고 올려요', () => {
    const local = normalizeState({ updatedAt: T0 });
    expect(chooseStartState(local, null, false)).toEqual({ state: local, upload: true });
  });

  it('같은 계정이 이 브라우저에서 쓴 데이터가 더 최신이면 그걸 지키고 다시 올려요', () => {
    const local = normalizeState({ updatedAt: T0 + 10 * MINUTE });
    const server = normalizeState({ updatedAt: T0 });
    expect(chooseStartState(local, server, true)).toEqual({ state: local, upload: true });
  });

  it('다른 계정의 데이터가 남아 있으면 서버 데이터로 시작해요', () => {
    const local = normalizeState({ updatedAt: T0 + 10 * MINUTE });
    const server = normalizeState({ updatedAt: T0 });
    expect(chooseStartState(local, server, false)).toEqual({ state: server, upload: false });
  });

  it('서버가 더 최신이면(다른 기기에서 썼으면) 서버 데이터로 시작해요', () => {
    const local = normalizeState({ updatedAt: T0 });
    const server = normalizeState({ updatedAt: T0 + 10 * MINUTE, tasks: [] });
    expect(chooseStartState(local, server, true).state).toMatchObject({ updatedAt: T0 + 10 * MINUTE });
  });

  it('새로고침해도 집중이 "끊겼었다"고 잘못 끝나지 않아요 (오늘 생긴 문제)', () => {
    // 집중을 시작한 뒤 30분 동안 창이 열려 있었고, 이 브라우저에는 방금 전 신호가 남아 있어요.
    // 서버에는 (예전 방식처럼) 집중 시작 무렵의 신호만 남아 있다고 해요.
    const focus = { taskId: 'a', startedAt: T0 };
    const task = { id: 'a', title: '코디세이', startAt: T0 - MINUTE, dueAt: T0 + 600 * MINUTE, focusMinutes: 0, dueExtensions: 0 };
    const server = normalizeState({ tasks: [task], focus, lastSeenAt: T0, updatedAt: T0 + 31 * MINUTE });
    const local = normalizeState({ tasks: [task], focus, lastSeenAt: T0 + 30 * MINUTE, updatedAt: T0 });
    const { state } = chooseStartState(local, server, true);

    const memory: Storage = { load: () => null, save: () => {} };
    let now = T0 + 30 * MINUTE + 20 * 1000; // 새로고침
    const store = new GameStore(memory, () => now);
    store.replaceState(state);
    expect(store.heartbeat()).toBeNull(); // 끊긴 걸로 보지 않아요
    expect(store.get().focus).not.toBeNull();
    for (let i = 0; i < 20; i++) { now += MINUTE; store.heartbeat(); }
    expect(store.get().focus).not.toBeNull();
  });
});
