import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from './config';

/** 플레이어 외형은 주민 도감·주민 뽑기와 별개예요. */
export const AVATARS = [
  { id: 'forest', name: '숲길', description: '갈색 머리와 청록색 목도리' },
  { id: 'mint', name: '민트', description: '민트색 머리와 초록 멜빵옷' },
  { id: 'lavender', name: '라벤더', description: '보라색 단발과 노란 카디건' },
] as const;

export type AvatarId = typeof AVATARS[number]['id'];
export type Facing = 'down' | 'up' | 'left' | 'right';
export const DEFAULT_AVATAR: AvatarId = 'forest';
export const AVATAR_FRAME = { width: CHARACTER_WIDTH, height: CHARACTER_HEIGHT, columns: 5 } as const;
export const AVATAR_ROWS = { down: 0, up: 1, side: 2 } as const;

export function isAvatarId(value: unknown): value is AvatarId {
  return AVATARS.some((avatar) => avatar.id === value);
}

/** 예전 저장 데이터와 아직 지원하지 않는 외형은 기존 갈색 머리로 보여줘요. */
export function normalizeAvatarId(value: unknown): AvatarId {
  return isAvatarId(value) ? value : DEFAULT_AVATAR;
}

export function facingForMovement(previous: Facing, dx: number, dy: number): Facing {
  if (dx !== 0) return dx < 0 ? 'left' : 'right';
  if (dy !== 0) return dy < 0 ? 'up' : 'down';
  return previous;
}

export function avatarRow(facing: Facing): number {
  return AVATAR_ROWS[facing === 'left' || facing === 'right' ? 'side' : facing];
}

export const avatarTexture = (id: AvatarId): string => `avatar-${id}`;
export const avatarWalk = (id: AvatarId, row: number): string => `avatar-${id}-walk-${row}`;
