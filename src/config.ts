// 크기와 규칙 기준값을 모아 두는 곳이에요. 써보면서 조절할 값은 여기만 고치면 돼요.

/** 바닥 타일 한 칸의 픽셀 크기 */
export const TILE_SIZE = 32;
/** 캐릭터 그림 한 칸의 픽셀 크기 (가로 × 세로) */
export const CHARACTER_WIDTH = 64;
export const CHARACTER_HEIGHT = 72;
/**
 * 픽셀 1개를 화면에서 몇 배로 보여줄지 정해요.
 * 창 크기와 상관없이 이 배율로 고정해서, 그림이 고르게 보이게 해요.
 * 창이 크면 더 넓은 마을이 보이고, 카메라가 내 캐릭터를 따라다녀요.
 */
export function pickPixelScale(windowHeight: number): number {
  return windowHeight >= 1000 ? 2 : 1;
}

/**
 * 주민을 화면에서 그림 파일보다 작게(또는 크게) 그리는 배율. 그림 파일은 그대로 두고 화면에서만 바꿔요.
 * 고양이·강아지가 플레이어(약 62픽셀)보다 커 보여서 줄였어요 (2026-11-09 사용자 요청, 64 → 약 48픽셀).
 * 정수 배율이 아니라서 픽셀 줄이 조금 고르지 않을 수 있어요. 나중에 그림 자체를 작게 다시 그리면 1로 되돌려요.
 */
export const RESIDENT_DISPLAY_SCALE: Record<string, number> = {
  'sprout-cat': 0.75,
  'sprout-puppy': 0.75,
};

export const RULES = {
  /** 진행 비율이 이 값 이하면 "아주 일찍" 끝낸 것으로 봐요 (희귀 확률 높음) */
  veryEarlyRatio: 0.3,
  /** 진행 비율이 이 값 이상이면 "늦게" 끝낸 것으로 봐요 (꾸벅이 또는 말썽). 2026-11-08 80% → 75% */
  lateRatio: 0.75,
  /** 아주 일찍 끝냈을 때 희귀 새싹이 나올 확률 */
  rareChanceVeryEarly: 0.4,
  /** 그냥 일찍 끝냈을 때 희귀 새싹이 나올 확률 */
  rareChanceEarly: 0.05,
  /** 심술이 시작되는 시점: 기간의 이 비율까지 한 번도 집중을 안 했으면 심술 반죽 (2026-11-08 20% → 50%) */
  grumpyGraceRatio: 0.5,
  /** 심술이 굳는 시점: 이때까지 한 번도 집중을 안 했으면 굳은 심술. 그 뒤에 집중해도 말랑으로 안 돌아가요 */
  grumpyStuckRatio: 0.75,
  /** 새싹 주민이 태어나려면 그 할 일에 모두 합쳐 이만큼(분) 집중했어야 해요. 부족하면 주민으로 자라지 못해요 (2026-11-10) */
  minFocusMinutesForSprout: 10,
} as const;

/** 집중 습관 기준값 (분) */
export const HABITS = {
  /** 푹 몰입하기: 끊지 않고 이만큼 집중 */
  deepFocusMinutes: 50,
  /** 쉬고 돌아오기: 휴식 앞뒤로 각각 이만큼 집중 */
  restAndReturnFocusMinutes: 25,
  /** 쉬고 돌아오기: 휴식은 최소 이만큼 */
  restMinMinutes: 1,
  /** 쉬고 돌아오기: 휴식은 바로 앞 집중 시간 ÷ 이 값 이하 (5 → 집중:휴식 = 5:1) */
  focusToRestRatio: 5,
  /** 차곡차곡 해내기: 하루에 서로 다른 할 일을 이만큼 완료 */
  manyDoneCount: 3,
} as const;

/** 주민 친밀도 단계 (♥ 개수) */
export const FRIENDSHIP = {
  /** 이만큼 모이면 친해져요 (가끔 다가와서 인사) */
  friendHearts: 3,
  /** 이만큼 모이면 진화해요 (보여주는 방식은 Codex와 정리 중) */
  evolveHearts: 6,
} as const;
