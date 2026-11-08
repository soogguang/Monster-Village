import type { SupabaseClient } from '@supabase/supabase-js';
import { isAvatarId, type AvatarId } from '../avatars';

/** 계정에 확정한 모습이 있어야 초기 선택창을 건너뛰어요. */
export function savedAvatar(metadata: Record<string, unknown> | null | undefined): AvatarId | null {
  return metadata?.avatar_confirmed === true && isAvatarId(metadata.avatar_id) ? metadata.avatar_id : null;
}

/** 다른 기기에서 이미 정했다면 그 선택을 유지해요. 실패하면 확정한 것으로 처리하지 않아요. */
export async function saveFirstAvatar(client: SupabaseClient, id: AvatarId): Promise<AvatarId> {
  if (!isAvatarId(id)) throw new Error('선택할 수 없는 모습이에요.');
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('로그인을 다시 확인해 주세요.');
  const existing = savedAvatar(data.user.user_metadata);
  if (existing) return existing;
  const { error: saveError } = await client.auth.updateUser({ data: { avatar_id: id, avatar_confirmed: true } });
  if (saveError) throw saveError;
  return id;
}
