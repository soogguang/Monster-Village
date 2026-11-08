// 내 게임 데이터를 Supabase에 저장하고 불러와요. (game_saves 표, 한 사람당 한 줄)
// - 로그인하면 서버에 저장된 데이터를 불러와요. 서버에 아직 없으면(첫 로그인) 이 브라우저의 데이터를 올려요.
// - 이 브라우저가 같은 계정으로 쓰던 데이터가 서버보다 최신이면(저장이 덜 올라갔을 때) 이 브라우저 쪽을 지키고 다시 올려요.
// - 게임 데이터가 바뀌면 잠깐(1.5초) 모았다가 한 번에 저장해요.
// - 브라우저에도 계속 저장해 두어서, 인터넷이 잠깐 끊겨도 게임은 그대로 돌아가요.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState, GameStore } from '../store';

const SAVE_DELAY_MS = 1500;
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

export async function startCloudSave(store: GameStore, client: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await client.from('game_saves').select('state').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  let owner: string | null = null;
  try { owner = window.localStorage.getItem(OWNER_KEY); } catch { /* 저장이 막힌 브라우저 */ }
  const start = chooseStartState(store.get(), data?.state as Partial<GameState> | undefined, owner === userId);
  if (start.state !== store.get()) store.replaceState(start.state);
  if (start.upload) await upload(client, userId, store.get());
  try { window.localStorage.setItem(OWNER_KEY, userId); } catch { /* 저장이 막힌 브라우저 */ }

  let timer: number | undefined;
  store.subscribeSaves((state) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      upload(client, userId, state).catch((err) => console.warn('[클라우드 저장] 저장하지 못했어요. 다음 변경 때 다시 시도해요.', err));
    }, SAVE_DELAY_MS);
  });
}

async function upload(client: SupabaseClient, userId: string, state: GameState): Promise<void> {
  const { error } = await client
    .from('game_saves')
    .upsert({ user_id: userId, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}
