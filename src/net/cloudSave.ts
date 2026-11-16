// 내 게임 데이터를 Supabase에 저장하고 불러와요. (game_saves 표, 한 사람당 한 줄)
// - 로그인하면 서버에 저장된 데이터를 불러와요. 서버에 아직 없으면(첫 로그인) 이 브라우저의 데이터를 올려요.
// - 이 브라우저가 같은 계정으로 쓰던 데이터가 서버보다 최신이면(저장이 덜 올라갔을 때) 이 브라우저 쪽을 지키고 다시 올려요.
// - 게임 데이터가 바뀌면 잠깐(1.5초) 모았다가 한 번에 저장해요.
// - 브라우저에도 계속 저장해 두어서, 인터넷이 잠깐 끊겨도 게임은 그대로 돌아가요.
//
// 여러 곳(노트북·휴대폰·다른 탭)에서 같은 계정을 쓸 때 (2026-11-16)
// - 저장할 때 "내가 마지막으로 본 버전(updated_at)일 때만" 덮어써요. 그사이 다른 곳이 저장했으면 덮어쓰지 않고,
//   최신 기록을 받아서 양쪽에서 바뀐 것을 합친 뒤 다시 저장해요. (예전에는 늦게 저장한 쪽이 통째로 덮어써서 기록이 사라질 수 있었어요)
// - 탭으로 돌아올 때·창을 다시 누를 때·인터넷이 다시 연결될 때, 그리고 화면을 보고 있는 동안 1분마다 최신 기록을 확인해요.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeState, type GameState, type GameStore } from '../store';

const SAVE_DELAY_MS = 1500;
const PULL_EVERY_MS = 60 * 1000;
/** 이 브라우저의 데이터가 어느 계정 것인지 (다른 계정 데이터로 덮어쓰지 않게) */
const OWNER_KEY = 'monster-village:cloud-owner';

/**
 * 접속할 때 어느 데이터로 시작할지 정해요.
 * - 서버에 없으면: 이 브라우저 데이터 (올려요)
 * - 같은 계정이 이 브라우저에서 쓰던 데이터가 더 최신이면: 이 브라우저 데이터 (다시 올려요)
 * - 그 밖에는 서버 데이터. 같은 계정이면 연결 신호 시각은 둘 중 늦은 쪽을 써요.
 */
export function chooseStartState(
  local: GameState,
  server: Partial<GameState> | null | undefined,
  sameOwner: boolean,
): { state: Partial<GameState>; upload: boolean } {
  if (!server) return { state: local, upload: true };
  if (sameOwner && local.updatedAt > (server.updatedAt ?? 0)) return { state: local, upload: true };
  if (!sameOwner) return { state: server, upload: false };
  const lastSeenAt = Math.max(local.lastSeenAt ?? 0, server.lastSeenAt ?? 0) || null;
  return { state: { ...server, lastSeenAt }, upload: false };
}

// ---------------------------------------------------------------- 양쪽 기록 합치기

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 세 갈래 비교: 한쪽만 바꿨으면 바꾼 쪽, 둘 다 바꿨으면 지금 쓰는 쪽(local) */
function pick<T>(base: T, local: T, server: T): T {
  if (same(local, base)) return server;
  if (same(server, base)) return local;
  return local;
}

/** id가 있는 목록(할 일·주민)은 항목마다 비교해요. 한쪽에서 지운 항목은, 다른 쪽이 그 항목을 고치지 않았을 때만 지워요. */
function mergeById<T extends { id: string }>(base: T[], local: T[], server: T[]): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const s = new Map(server.map((x) => [x.id, x]));
  const ids = [...new Set([...server.map((x) => x.id), ...local.map((x) => x.id)])];
  const out: T[] = [];
  for (const id of ids) {
    const bi = b.get(id), li = l.get(id), si = s.get(id);
    if (li && si) out.push(bi ? pick(bi, li, si) : li);
    else if (li) { if (!(bi && same(li, bi))) out.push(li); } // 서버에서 지웠는데 여기서 안 고쳤으면 지운 대로
    else if (si) { if (!(bi && same(si, bi))) out.push(si); } // 여기서 지웠는데 서버에서 안 고쳤으면 지운 대로
  }
  return out;
}

/** 연결 신호(lastSeenAt)와 바뀐 시각을 빼고 같은지. 연결 신호만 달라진 건 "고친 것"으로 치지 않아요. */
export function sameContent(a: GameState, b: GameState): boolean {
  return same({ ...a, lastSeenAt: 0, updatedAt: 0 }, { ...b, lastSeenAt: 0, updatedAt: 0 });
}

/**
 * 마지막으로 맞춘 기록(base)에서 이 기기(local)와 서버(server)가 각각 바꾼 것을 합쳐요.
 * - 할 일·주민: 항목마다 한쪽만 바꿨으면 그쪽, 둘 다 바꿨으면 이 기기 쪽
 * - 집중 기록: 둘 다 모아요 (같은 집중은 하나로)  · 해금: 둘 다 모아요 (먼저 해금한 시각)
 * - 오늘 할 일: 날짜마다 비교하고, 둘 다 바꿨으면 합쳐요
 * - 연결 신호·바뀐 시각: 늦은 쪽
 */
export function mergeStates(baseIn: Partial<GameState>, localIn: Partial<GameState>, serverIn: Partial<GameState>): GameState {
  const base = normalizeState(baseIn), local = normalizeState(localIn), server = normalizeState(serverIn);
  const sessions = new Map<string, GameState['sessions'][number]>();
  for (const x of [...server.sessions, ...local.sessions]) {
    const key = `${x.taskId}|${x.startedAt}`;
    const prev = sessions.get(key);
    if (!prev || x.endedAt > prev.endedAt) sessions.set(key, x);
  }
  const unlocks: GameState['unlocks'] = { ...server.unlocks };
  for (const [k, v] of Object.entries(local.unlocks) as [keyof GameState['unlocks'], number][]) {
    unlocks[k] = Math.min(v, unlocks[k] ?? Infinity);
  }
  const plans: GameState['plans'] = {};
  for (const day of new Set([...Object.keys(server.plans), ...Object.keys(local.plans)])) {
    const b = base.plans[day] ?? [], l = local.plans[day] ?? [], s = server.plans[day] ?? [];
    const merged = !same(l, b) && !same(s, b) ? [...new Set([...s, ...l])] : pick(b, l, s);
    if (merged.length) plans[day] = merged;
  }
  return normalizeState({
    avatarId: pick(base.avatarId, local.avatarId, server.avatarId),
    tasks: mergeById(base.tasks, local.tasks, server.tasks),
    residents: mergeById(base.residents, local.residents, server.residents),
    focus: pick(base.focus, local.focus, server.focus),
    sessions: [...sessions.values()].sort((a, b) => a.startedAt - b.startedAt),
    unlocks,
    plans,
    lastSeenAt: Math.max(local.lastSeenAt ?? 0, server.lastSeenAt ?? 0) || null,
    updatedAt: Math.max(local.updatedAt, server.updatedAt),
  });
}

// ---------------------------------------------------------------- 서버와 맞추기

/** 서버의 한 줄. version은 updated_at 그대로예요 (저장할 때 "이 버전일 때만" 조건으로 써요) */
export interface SaveRow { state: Partial<GameState>; version: string }

/** Supabase 표를 감싼 것 (테스트에서는 가짜로 바꿔 끼워요) */
export interface SaveTable {
  read(): Promise<SaveRow | null>;
  /** 처음 저장. 이미 줄이 있으면 null */
  insert(state: GameState): Promise<string | null>;
  /** version이 그대로일 때만 저장. 그사이 다른 곳이 저장했으면 null */
  update(state: GameState, version: string): Promise<string | null>;
}

export function supabaseSaveTable(client: SupabaseClient, userId: string): SaveTable {
  return {
    async read() {
      const { data, error } = await client.from('game_saves').select('state, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data ? { state: data.state as Partial<GameState>, version: data.updated_at as string } : null;
    },
    async insert(state) {
      const { data, error } = await client.from('game_saves')
        .insert({ user_id: userId, state, updated_at: new Date().toISOString() }).select('updated_at').maybeSingle();
      if (error) { if (error.code === '23505') return null; throw error; } // 그사이 다른 곳이 먼저 만들었어요
      return (data?.updated_at as string | undefined) ?? null;
    },
    async update(state, version) {
      const { data, error } = await client.from('game_saves')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('updated_at', version).select('updated_at');
      if (error) throw error;
      return (data?.[0]?.updated_at as string | undefined) ?? null;
    },
  };
}

/**
 * 이 기기와 서버를 맞춰요.
 * - base: 서버와 마지막으로 맞춘 기록, version: 그때 서버의 updated_at
 * - pull: 서버가 바뀌었으면 받아서(이 기기에서 고친 게 있으면 합쳐서) 화면에 반영
 * - push: "내가 본 버전일 때만" 저장. 겹치면 pull로 합치고 다시 저장
 * 받기·저장은 한 번에 하나씩만 해요.
 */
export class CloudSync {
  private base: GameState;
  private version: string | null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private store: GameStore, private table: SaveTable, row: SaveRow | null) {
    this.version = row?.version ?? null;
    this.base = row ? normalizeState(row.state) : normalizeState(null);
  }

  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  pull(): Promise<boolean> {
    return this.serial(() => this.pullNow());
  }

  push(): Promise<void> {
    return this.serial(() => this.pushNow());
  }

  /** 서버가 바뀌었으면 받아서 반영해요. 이 기기에서 아직 안 올린 고친 게 있으면 true (다시 올려야 해요) */
  private async pullNow(): Promise<boolean> {
    const row = await this.table.read();
    if (!row || row.version === this.version) return false;
    const server = normalizeState(row.state);
    const local = this.store.get();
    const localChanged = !sameContent(local, this.base);
    const next = localChanged
      ? mergeStates(this.base, local, server)
      : { ...server, lastSeenAt: Math.max(local.lastSeenAt ?? 0, server.lastSeenAt ?? 0) || null };
    this.base = server;
    this.version = row.version;
    this.store.replaceState(next, { fromCloud: true });
    return localChanged;
  }

  private async pushNow(): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = this.store.get();
      const version = this.version === null ? await this.table.insert(state) : await this.table.update(state, this.version);
      if (version) { this.version = version; this.base = state; return; }
      await this.pullNow(); // 그사이 다른 곳이 저장했어요: 받아서 합친 뒤 다시 저장해요
    }
    throw new Error('다른 기기와 저장이 계속 겹쳐요. 잠시 뒤 다시 저장할게요.');
  }
}

export async function startCloudSave(store: GameStore, client: SupabaseClient, userId: string): Promise<void> {
  const table = supabaseSaveTable(client, userId);
  const row = await table.read();
  let owner: string | null = null;
  try { owner = window.localStorage.getItem(OWNER_KEY); } catch { /* 저장이 막힌 브라우저 */ }
  const start = chooseStartState(store.get(), row?.state, owner === userId);
  if (start.state !== store.get()) store.replaceState(start.state, { fromCloud: true });
  const sync = new CloudSync(store, table, row);
  if (start.upload) await sync.push();
  try { window.localStorage.setItem(OWNER_KEY, userId); } catch { /* 저장이 막힌 브라우저 */ }

  const warn = (err: unknown) => console.warn('[클라우드 저장] 저장하지 못했어요. 다음 변경 때 다시 시도해요.', err);
  let timer: number | undefined;
  store.subscribeSaves(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { sync.push().catch(warn); }, SAVE_DELAY_MS);
  });

  // 다른 곳에서 바뀐 기록 받기
  const pull = async () => {
    if (await sync.pull()) await sync.push(); // 이 기기에서 고친 것도 있으면 합친 걸 다시 올려요
  };
  const pullQuietly = () => { pull().catch((err) => console.warn('[클라우드 저장] 최신 기록을 받지 못했어요.', err)); };
  store.setSyncHook(pull);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullQuietly(); });
  window.addEventListener('focus', pullQuietly);
  window.addEventListener('online', pullQuietly);
  window.setInterval(() => { if (document.visibilityState === 'visible') pullQuietly(); }, PULL_EVERY_MS);
}
