// 주민 친밀도 규칙
// 같은 캐릭터가 또 태어나면 새 주민 대신 친밀도 ♥가 1 올라가요.

import { FRIENDSHIP } from '../config';

export type FriendshipStage = 'met' | 'friend' | 'evolved';

export function friendshipStage(hearts: number): FriendshipStage {
  if (hearts >= FRIENDSHIP.evolveHearts) return 'evolved';
  if (hearts >= FRIENDSHIP.friendHearts) return 'friend';
  return 'met';
}

/** 같은 주민인지 구분하는 이름: 캐릭터 id, 그림이 아직 없으면 계열(+희귀)로 묶어요. */
export function residentKey(r: { speciesId: string | null; kind: string; rare: boolean }): string {
  return r.speciesId ?? `placeholder:${r.kind}${r.rare ? ':rare' : ''}`;
}
