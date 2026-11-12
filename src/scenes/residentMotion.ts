/** 기존에 승인된 행동 그림만 사용해요. 주민 해금·진화 규칙과는 별개예요. */
interface ActionFrame { image: string; ms: number; lift?: number }
const ACTIONS: Record<string, readonly ActionFrame[]> = {
  'sprout-mandu': [
    { image: 'sprout-mandu-eat', ms: 650 },
    { image: 'sprout-mandu-full', ms: 1100 },
  ],
  'sprout-puppy': [
    { image: 'sprout-puppy-dig', ms: 360, lift: 1 },
    { image: 'sprout-puppy', ms: 140 },
    { image: 'sprout-puppy-dig', ms: 360, lift: 1 },
    { image: 'sprout-puppy', ms: 140 },
    { image: 'sprout-puppy-dig', ms: 500 },
    { image: 'sprout-puppy-sit', ms: 1800 },
  ],
  'sprout-cat': [
    { image: 'sprout-cat-sit', ms: 1800 },
    { image: 'sprout-cat-dandelion', ms: 2300 },
    { image: 'sprout-cat-sit', ms: 1200 },
  ],
  'sprout-rabbit': [
    { image: 'sprout-rabbit', ms: 180 },
    { image: 'sprout-rabbit-jump', ms: 300, lift: 8 },
    { image: 'sprout-rabbit', ms: 180 },
    { image: 'sprout-rabbit-jump', ms: 300, lift: 6 },
    { image: 'sprout-rabbit', ms: 300 },
    { image: 'sprout-rabbit-sit', ms: 1800 },
  ],
  // 희귀 새싹 별마녀냥: 친구 옆으로 가서 별 마법봉을 내밀면 발치에 계절 꽃이 피어나고, 앉아서 쉬어요.
  'sprout-witch-cat': [
    { image: 'sprout-witch-cat-cast', ms: 1400 },
    { image: 'sprout-witch-cat-sit', ms: 2200 },
  ],
  // 꾸벅이 풀잎곰: 앉았다가 낙엽을 모아 덮고 꾸벅 잠들어요(특별한 모습 '낙엽 이불').
  // 꾸벅이는 쉬거나 자는 모습을 훨씬 길게 해요(사용자 결정). 30초 자고 일어나서 잠깐 걸어서, 대부분 낙엽 이불 속에 있어요.
  'sleepy-leaf-bear': [
    { image: 'sleepy-leaf-bear-sit', ms: 1200 },
    { image: 'sleepy-leaf-bear-leaf-blanket', ms: 30000 },
    { image: 'sleepy-leaf-bear-sit', ms: 1200 },
  ],
};

/**
 * 꽃을 피워 주는 주민 (별마녀냥, 2026-11-11 사용자 결정)
 * - bloomAt: 동작이 시작되고 몇 ms에 꽃이 피는지
 * - holdUntil: 꽃을 받는 주민이 하던 일을 멈추고 정면으로 서서 기다리는 시간(동작 시작부터). 마법봉 동작이 끝날 때까지예요.
 */
export const FLOWER_GIFTERS: Readonly<Record<string, { bloomAt: number; holdUntil: number }>> = {
  'sprout-witch-cat': { bloomAt: 700, holdUntil: 1400 },
};
/** 피운 꽃은 10초 동안 피어 있다가(마지막 2초는 서서히) 사라지고, 마당마다 동시에 3송이까지만 둬요. (저장하지 않아요, 2026-11-11 사용자 결정) */
export const FLOWER_LIFETIME_MS = 10_000;
export const MAX_FLOWERS_PER_YARD = 3;
export const SEASON_FLOWERS = ['flower-tulip', 'flower-hydrangea', 'flower-sunflower', 'flower-camellia'] as const;
export type SeasonFlower = (typeof SEASON_FLOWERS)[number];

/** 내 시간대 날짜로 계절 꽃을 골라요: 봄(3~5월) 튤립, 여름(6~8월) 수국, 가을(9~11월) 해바라기, 겨울(12~2월) 동백 */
export function seasonFlower(date: Date): SeasonFlower {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'flower-tulip';
  if (month >= 6 && month <= 8) return 'flower-hydrangea';
  if (month >= 9 && month <= 11) return 'flower-sunflower';
  return 'flower-camellia';
}

export function residentActionImages(speciesId: string | null): string[] {
  return [...new Set((ACTIONS[speciesId ?? ''] ?? []).map((frame) => frame.image))];
}

/** 동작이 끝나면 null. 발밑을 기준으로 정렬된 PNG를 늘이거나 줄이지 않아요. */
export function residentActionPose(speciesId: string | null, elapsed: number): { image: string; lift: number } | null {
  let remaining = Math.max(0, elapsed);
  for (const frame of ACTIONS[speciesId ?? ''] ?? []) {
    if (remaining < frame.ms) return { image: frame.image, lift: frame.lift ?? 0 };
    remaining -= frame.ms;
  }
  return null;
}

interface Point { x: number; y: number }

/** 정수 픽셀로 위치만 옮겨서 눈과 외곽선을 다시 샘플링하지 않아요. */
export function residentWalkPose(from: Point, to: Point, elapsed: number, duration: number) {
  const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  const x = Math.round(from.x + (to.x - from.x) * progress);
  const groundY = Math.round(from.y + (to.y - from.y) * progress);
  const lift = progress > 0 && progress < 1 ? Math.round(Math.abs(Math.sin(elapsed * Math.PI / 320)) * 2) : 0;
  return { x, y: groundY - lift, groundY, done: progress === 1 };
}
