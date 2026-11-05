// 광장 사물의 발밑 위치와 사용 가능한 거리를 화면 코드와 분리해요. 단위는 타일이에요.
import type { Spot, VillageLayout } from './layout';

export const LANDMARK_TEXT = {
  tree: { name: '수호나무', action: '공동 할 일 열기' },
  campfire: { name: '모닥불', action: '집중하기' },
  bell: { name: '응원의 종', action: '응원할 친구 고르기' },
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

export function landmarkTargets(layout: VillageLayout): LandmarkTarget[] {
  const target = (id: LandmarkId, spot: Spot): LandmarkTarget => ({ id, col: spot.col + 0.5, row: spot.row + 1 });
  return [target('tree', layout.anchors.guardianTree), target('campfire', layout.anchors.campfire), target('bell', layout.anchors.bell)];
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
