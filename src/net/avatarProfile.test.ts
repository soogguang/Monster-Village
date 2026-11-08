import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { savedAvatar, saveFirstAvatar } from './avatarProfile';

function clientWith(metadata: Record<string, unknown> = {}) {
  const getUser = vi.fn(async () => ({ data: { user: { id: 'me', user_metadata: metadata } }, error: null }));
  const updateUser = vi.fn(async (_value: unknown) => ({ data: {}, error: null }));
  const client = { auth: { getUser, updateUser } } as unknown as SupabaseClient;
  return { client, getUser, updateUser };
}

describe('처음 한 번 고르는 아바타', () => {
  it('확정 표시와 유효한 모습이 함께 저장돼 있어야 선택창을 건너뛰어요', () => {
    expect(savedAvatar({ avatar_id: 'mint', avatar_confirmed: true })).toBe('mint');
    expect(savedAvatar({ avatar_id: 'mint' })).toBeNull();
    expect(savedAvatar({ avatar_id: 'removed', avatar_confirmed: true })).toBeNull();
    expect(savedAvatar(null)).toBeNull();
  });

  it('처음 고른 모습과 확정 표시를 계정에 함께 저장해요', async () => {
    const { client, updateUser } = clientWith({ nickname_confirmed: true });
    expect(await saveFirstAvatar(client, 'lavender')).toBe('lavender');
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar_id: 'lavender', avatar_confirmed: true } });
  });

  it('다른 기기에서 이미 확정했다면 오래된 선택창으로 덮어쓰지 않아요', async () => {
    const { client, updateUser } = clientWith({ avatar_id: 'mint', avatar_confirmed: true });
    expect(await saveFirstAvatar(client, 'forest')).toBe('mint');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('계정 확인에 실패하면 확정 정보를 저장하지 않아요', async () => {
    const { client, getUser, updateUser } = clientWith();
    getUser.mockRejectedValueOnce(new Error('offline'));
    await expect(saveFirstAvatar(client, 'mint')).rejects.toThrow('offline');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('저장에 실패하면 성공으로 처리하지 않아서 다시 시도할 수 있어요', async () => {
    const { client, updateUser } = clientWith();
    updateUser.mockRejectedValueOnce(new Error('offline'));
    await expect(saveFirstAvatar(client, 'mint')).rejects.toThrow('offline');
    expect(await saveFirstAvatar(client, 'mint')).toBe('mint');
  });
});
