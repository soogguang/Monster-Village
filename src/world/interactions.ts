// 광장 사물의 발밑 위치와 사용 가능한 거리를 화면 코드와 분리해요. 단위는 타일이에요.
import type { Spot, VillageLayout, YardPlan } from './layout';

export const LANDMARK_TEXT = {
  tree: { name: '수호나무', action: '공동 할 일 열기' },
  campfire: { name: '모닥불', action: '집중하기' },
  bell: { name: '응원의 종', action: '응원할 친구 고르기' },
  home: { name: '우리 집', action: '집으로 돌아가기' },
} as const;

export type LandmarkId = keyof typeof LANDMARK_TEXT;
export interface LandmarkTarget extends Spot { id: LandmarkId }

/** 사물 그림의 중심이 아니라 실제로 다가갈 수 있는 발밑에서 거리를 재요. */
export const INTERACTION_RADIUS = 3;

export interface VillageActions {
  interact(id: LandmarkId): void;
  setNearby(id: LandmarkId | null): void;
  notify(text: string): void;
}

/**
 * 사용할 수 있는 사물. 방 마을에서는 광장의 세 사물과, 내 집(누르면 내 집 화면으로 돌아가요)이 있어요.
 * 내 집 화면에는 사용할 사물이 없어요.
 */
export function landmarkTargets(layout: VillageLayout, myYard?: YardPlan): LandmarkTarget[] {
  if (!layout.hasPlaza) return [];
  const target = (id: LandmarkId, spot: Spot): LandmarkTarget => ({ id, col: spot.col + 0.5, row: spot.row + 1 });
  const targets = [target('tree', layout.anchors.guardianTree), target('campfire', layout.anchors.campfire), target('bell', layout.anchors.bell)];
  // 집 기준점은 바닥 가운데 경계선이라 0.5를 더하지 않아요. 문 바로 앞에서 쓸 수 있어요.
  if (myYard) targets.push({ id: 'home', col: myYard.house.col, row: myYard.house.row + 1 });
  return targets;
}

export function canInteract(player: Spot, target: LandmarkTarget): boolean {
  return Math.hypot(player.col - target.col, player.row - target.row) <= INTERACTION_RADIUS;
}

export function nearbyLandmark(player: Spot, targets: readonly LandmarkTarget[]): LandmarkTarget | null {
  let nearest: LandmarkTarget | null = null;
  let distance = Infinity;
  for (const target of targets) {
    const current = Math.hypot(player.col - target.col, player.row - target.row);
    if (current <= INTERACTION_RADIUS && current < distance) { nearest = target; distance = current; }
  }
  return nearest;
}
