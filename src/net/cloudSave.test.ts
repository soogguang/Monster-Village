import { describe, expect, it } from 'vitest';
import { GameStore, normalizeState, type Storage } from '../store';
import { CloudSync, chooseStartState, mergeStates, type SaveRow, type SaveTable } from './cloudSave';

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

const task = (id: string, title: string) => ({ id, title, startAt: T0, dueAt: T0 + 600 * MINUTE, focusMinutes: 0, dueExtensions: 0 });

describe('양쪽 기록 합치기', () => {
  it('두 기기에서 따로 추가한 할 일이 모두 남아요', () => {
    const base = normalizeState({ tasks: [task('a', '보고서')] });
    const local = normalizeState({ tasks: [task('a', '보고서'), task('b', '영어')] });
    const server = normalizeState({ tasks: [task('a', '보고서'), task('c', '독서')] });
    expect(mergeStates(base, local, server).tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('한쪽에서 고친 항목은 고친 대로, 한쪽에서 지운 항목은 지운 대로', () => {
    const base = normalizeState({ tasks: [task('a', '보고서'), task('b', '영어')] });
    const local = normalizeState({ tasks: [task('a', '보고서 마무리'), task('b', '영어')] });
    const server = normalizeState({ tasks: [task('a', '보고서')] }); // 다른 기기에서 b를 지웠어요
    expect(mergeStates(base, local, server).tasks).toEqual([task('a', '보고서 마무리')]);
  });

  it('집중 기록과 해금은 둘 다 모아요 (해금은 먼저 한 시각)', () => {
    const s1 = { taskId: 'a', startedAt: T0, endedAt: T0 + 30 * MINUTE };
    const s2 = { taskId: 'b', startedAt: T0 + 60 * MINUTE, endedAt: T0 + 90 * MINUTE };
    const base = normalizeState({});
    const local = normalizeState({ sessions: [s1], unlocks: { 'deep-focus': T0 + 5 } });
    const server = normalizeState({ sessions: [s2], unlocks: { 'deep-focus': T0, 'many-done': T0 + 9 } });
    const merged = mergeStates(base, local, server);
    expect(merged.sessions).toEqual([s1, s2]);
    expect(merged.unlocks).toEqual({ 'deep-focus': T0, 'many-done': T0 + 9 });
  });

  it('같은 날 오늘 할 일을 양쪽에서 바꾸면 합쳐요', () => {
    const base = normalizeState({ plans: { '2026-11-16': ['a'] } });
    const local = normalizeState({ plans: { '2026-11-16': ['a', 'b'] } });
    const server = normalizeState({ plans: { '2026-11-16': ['a', 'c'] } });
    expect(mergeStates(base, local, server).plans['2026-11-16']).toEqual(['a', 'c', 'b']);
  });
});

/** 서버의 한 줄을 흉내 내요. 저장할 때마다 버전이 바뀌어요. */
function fakeTable(): { table: () => SaveTable; row: () => SaveRow | null } {
  let row: SaveRow | null = null;
  let n = 0;
  const table = (): SaveTable => ({
    read: async () => (row ? { state: structuredClone(row.state), version: row.version } : null),
    insert: async (state) => {
      if (row) return null;
      row = { state: structuredClone(state), version: `v${++n}` };
      return row.version;
    },
    update: async (state, version) => {
      if (!row || row.version !== version) return null;
      row = { state: structuredClone(state), version: `v${++n}` };
      return row.version;
    },
  });
  return { table, row: () => row };
}

describe('여러 기기에서 같은 계정을 쓸 때', () => {
  const memory = (): Storage => ({ load: () => null, save: () => {} });

  it('늦게 저장한 기기가 다른 기기의 할 일을 덮어쓰지 않아요', async () => {
    const server = fakeTable();
    const laptop = new GameStore(memory(), () => T0);
    const phone = new GameStore(memory(), () => T0);
    const laptopSync = new CloudSync(laptop, server.table(), null);
    await laptopSync.push();
    const phoneSync = new CloudSync(phone, server.table(), await server.table().read());

    laptop.addTask('보고서', T0, T0 + 600 * MINUTE);
    phone.addTask('영어 단어', T0, T0 + 600 * MINUTE); // 노트북 기록을 아직 못 받은 채로
    await laptopSync.push();
    await phoneSync.push(); // 버전이 달라서 받아서 합친 뒤 저장해요

    const titles = (s: Partial<ReturnType<GameStore['get']>>) => (s.tasks ?? []).map((t) => t.title).sort();
    expect(titles(server.row()!.state)).toEqual(['보고서', '영어 단어']);
    expect(titles(phone.get())).toEqual(['보고서', '영어 단어']);
    await laptopSync.pull(); // 노트북도 탭으로 돌아오면 받아요
    expect(titles(laptop.get())).toEqual(['보고서', '영어 단어']);
  });

  it('연결 신호만 바뀐 기기는 서버 기록을 그대로 받아요 (다른 기기의 집중 시작이 사라지지 않게)', async () => {
    const server = fakeTable();
    const tasks = [task('a', '보고서')];
    let now = T0;
    const laptop = new GameStore(memory(), () => now);
    laptop.replaceState({ tasks, lastSeenAt: T0 });
    const laptopSync = new CloudSync(laptop, server.table(), null);
    await laptopSync.push();
    const phone = new GameStore(memory(), () => now);
    const phoneSync = new CloudSync(phone, server.table(), await server.table().read());
    phone.replaceState((await server.table().read())!.state, { fromCloud: true });

    now = T0 + MINUTE;
    phone.startFocus('a');
    await phoneSync.push();
    laptop.heartbeat(); // 노트북은 연결 신호만 남겼어요
    await laptopSync.pull();
    expect(laptop.get().focus).toEqual({ taskId: 'a', startedAt: T0 + MINUTE });
  });
});
