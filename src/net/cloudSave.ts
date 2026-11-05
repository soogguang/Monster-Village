// 내 게임 데이터를 Supabase에 저장하고 불러와요. (game_saves 표, 한 사람당 한 줄)
// - 로그인하면 서버에 저장된 데이터를 불러와요. 서버에 아직 없으면(첫 로그인) 이 브라우저의 데이터를 올려요.
// - 게임 데이터가 바뀌면 잠깐(1.5초) 모았다가 한 번에 저장해요.
// - 브라우저에도 계속 저장해 두어서, 인터넷이 잠깐 끊겨도 게임은 그대로 돌아가요.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState, GameStore } from '../store';

const SAVE_DELAY_MS = 1500;

export async function startCloudSave(store: GameStore, client: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await client.from('game_saves').select('state').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data?.state) store.replaceState(data.state as Partial<GameState>);
  else await upload(client, userId, store.get());

  let timer: number | undefined;
  store.subscribe((state) => {
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
