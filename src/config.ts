// 크기와 규칙 기준값을 모아 두는 곳이에요. 써보면서 조절할 값은 여기만 고치면 돼요.

/** 바닥 타일 한 칸의 픽셀 크기 */
export const TILE_SIZE = 16;
/** 캐릭터 그림 한 칸의 픽셀 크기 */
export const CHARACTER_SIZE = 32;
/**
 * 픽셀 1개를 화면에서 몇 배로 보여줄지 정해요.
 * 창 크기와 상관없이 이 배율로 고정해서, 픽셀이 너무 커 보이지 않게 해요.
 * 창이 크면 더 넓은 마을이 보이고, 카메라가 내 캐릭터를 따라다녀요.
 */
export function pickPixelScale(windowHeight: number): number {
  return windowHeight >= 1000 ? 3 : 2;
}

export const RULES = {
  /** 진행 비율이 이 값 이하면 "아주 일찍" 끝낸 것으로 봐요 (희귀 확률 높음) */
  veryEarlyRatio: 0.3,
  /** 진행 비율이 이 값 이상이면 "늦게" 끝낸 것으로 봐요 (꾸벅이 또는 말썽) */
  lateRatio: 0.8,
  /** 늦게 끝냈을 때 꾸벅이 주민이 되려면 필요한 총 집중 시간(분) */
  focusMinutesForSleepy: 25,
  /** 아주 일찍 끝냈을 때 희귀 새싹이 나올 확률 */
  rareChanceVeryEarly: 0.4,
  /** 그냥 일찍 끝냈을 때 희귀 새싹이 나올 확률 */
  rareChanceEarly: 0.05,
} as const;
