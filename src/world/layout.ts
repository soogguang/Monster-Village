// 동네 맵 배치 (타일 단위)
// Codex가 만든 배치 규격(design/village/layout-template.json, expandable-layout.mjs)을 게임 코드로 옮긴 것이에요.
// - 마당과 집은 위쪽, 마당 출입문은 남쪽, 큰길과 광장(수호나무·모닥불·종)은 아래쪽
// - 방 멤버 수만큼 마당을 좌우로 반복해요. 인원 상한은 없어요.
// - 자리(slot)는 가운데 0, 오른쪽 1, 왼쪽 -1, 오른쪽 2, 왼쪽 -2 … 순서로 정해요.
//   한 번 정해진 자리는 바뀌지 않고, 방을 나갔다 와도 같은 자리예요. 모든 멤버가 같은 배정을 봐요.
// - 광장과 첫 마당(0번)의 좌표는 고정이고, 왼쪽으로 늘어나면 음수 좌표가 생겨요.

export interface Rect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export interface Spot {
  col: number;
  row: number;
}

export interface SlotAssignment {
  userId: string;
  slot: number;
}

export interface YardPlan {
  userId: string;
  slot: number;
  rect: Rect;
  /** 남쪽 울타리에 난 문 (폭 3칸) */
  gate: Rect;
  /** 집 기준점: 바닥 가운데. col은 경계선(x = col × 타일) */
  house: { col: number; row: number; texture: string };
}

export interface VillageLayout {
  assignments: SlotAssignment[];
  yards: YardPlan[];
  mainStreet: Rect;
  plaza: Rect;
  plazaConnector: Rect;
  /** 광장 물건 기준점: 바닥 가운데 타일 */
  anchors: { guardianTree: Spot; campfire: Spot; bell: Spot };
  /** 맵 전체 범위. 왼쪽으로 늘어나면 col이 음수가 돼요 */
  bounds: Rect;
}

export const TEMPLATE = {
  yard: {
    origin: { col: 34, row: 3 },
    cols: 28,
    rows: 22,
    strideCols: 32,
    gate: { offsetCols: 12, cols: 3 },
    houseOffset: { col: 14, row: 7 },
    houseTextures: ['house-teal', 'house-clay'],
  },
  mainStreet: { row: 25, rows: 3 },
  plaza: { col: 36, row: 30, cols: 24, rows: 12 },
  plazaConnector: { col: 46, row: 28, cols: 3, rows: 2 },
  anchors: {
    guardianTree: { col: 42, row: 39 },
    campfire: { col: 49, row: 40 },
    bell: { col: 56, row: 39 },
  },
  bounds: { row: 0, rows: 44 },
  boundsPaddingCols: 2,
} as const;

/** i번째로 배정되는 자리: 0, 1, -1, 2, -2, … */
export function slotAt(index: number): number {
  if (index === 0) return 0;
  return index % 2 === 0 ? -index / 2 : (index + 1) / 2;
}

/**
 * 멤버마다 자리를 정해요. 이미 정해진 자리(previous)는 그대로 두고, 새 멤버만 빈자리 중 앞 순서에 넣어요.
 * previous에는 방을 나간 멤버의 자리도 남겨 두어서, 그 자리는 다른 사람에게 주지 않아요.
 */
export function assignSlots(memberIds: string[], previous: SlotAssignment[] = []): Map<string, number> {
  const assignments = new Map<string, number>();
  const used = new Set<number>();
  for (const { userId, slot } of previous) {
    if (assignments.has(userId) || used.has(slot)) continue;
    assignments.set(userId, slot);
    used.add(slot);
  }
  let next = 0;
  for (const userId of memberIds) {
    if (assignments.has(userId)) continue;
    while (used.has(slotAt(next))) next++;
    const slot = slotAt(next++);
    assignments.set(userId, slot);
    used.add(slot);
  }
  return assignments;
}

export function createVillageLayout(memberIds: string[], previous: SlotAssignment[] = []): VillageLayout {
  const assignments = assignSlots(memberIds, previous);
  const { yard, plaza } = TEMPLATE;
  const yardCol = (slot: number) => yard.origin.col + slot * yard.strideCols;

  const yards: YardPlan[] = memberIds.map((userId) => {
    const slot = assignments.get(userId)!;
    const col = yardCol(slot);
    return {
      userId,
      slot,
      rect: { col, row: yard.origin.row, cols: yard.cols, rows: yard.rows },
      gate: { col: col + yard.gate.offsetCols, row: yard.origin.row + yard.rows - 1, cols: yard.gate.cols, rows: 1 },
      house: {
        col: col + yard.houseOffset.col,
        row: yard.origin.row + yard.houseOffset.row,
        texture: yard.houseTextures[Math.abs(slot) % yard.houseTextures.length],
      },
    };
  });

  // 나간 멤버의 자리까지 포함해서 범위를 잡아요. (사람이 나가도 맵이 줄어들며 다른 집이 움직이지 않게)
  let left = Math.min(yard.origin.col, plaza.col);
  let right = Math.max(yard.origin.col + yard.cols, plaza.col + plaza.cols);
  for (const slot of assignments.values()) {
    left = Math.min(left, yardCol(slot));
    right = Math.max(right, yardCol(slot) + yard.cols);
  }
  const pad = TEMPLATE.boundsPaddingCols;
  return {
    assignments: [...assignments].map(([userId, slot]) => ({ userId, slot })),
    yards,
    mainStreet: { col: left, row: TEMPLATE.mainStreet.row, cols: right - left, rows: TEMPLATE.mainStreet.rows },
    plaza: { ...plaza },
    plazaConnector: { ...TEMPLATE.plazaConnector },
    anchors: {
      guardianTree: { ...TEMPLATE.anchors.guardianTree },
      campfire: { ...TEMPLATE.anchors.campfire },
      bell: { ...TEMPLATE.anchors.bell },
    },
    bounds: { col: left - pad, row: TEMPLATE.bounds.row, cols: right - left + pad * 2, rows: TEMPLATE.bounds.rows },
  };
}

/**
 * 맵이 화면보다 좁으면(혼자이거나 멤버가 적을 때) 양옆에 풀밭을 넓혀서 최소 폭을 맞춰요.
 * 큰길도 같이 늘려요. 마당·광장 좌표는 그대로예요.
 */
export function withMinWidth(layout: VillageLayout, minCols: number, extraRows = 0): VillageLayout {
  const extra = minCols - layout.bounds.cols;
  if (extra <= 0 && extraRows === 0) return layout;
  const left = Math.max(0, Math.floor(extra / 2));
  const bounds = { col: layout.bounds.col - left, row: layout.bounds.row, cols: Math.max(minCols, layout.bounds.cols), rows: layout.bounds.rows + extraRows };
  return { ...layout, bounds, mainStreet: { ...layout.mainStreet, col: bounds.col, cols: bounds.cols } };
}

// ---------------------------------------------------------------- 타일

export type Ground = 'grass' | 'dirt' | 'stone';
export type Overlay = 'fence-h' | 'fence-v' | 'fence-corner' | null;

export interface TileGrid {
  /** [row - bounds.row][col - bounds.col] */
  ground: Ground[][];
  overlay: Overlay[][];
  bounds: Rect;
}

/** 집 그림의 크기(타일). 160×160 그림 = 5×5칸 */
export const HOUSE_TILES = 5;

export function buildTiles(layout: VillageLayout): TileGrid {
  const { bounds } = layout;
  const ground: Ground[][] = Array.from({ length: bounds.rows }, () => Array<Ground>(bounds.cols).fill('grass'));
  const overlay: Overlay[][] = Array.from({ length: bounds.rows }, () => Array<Overlay>(bounds.cols).fill(null));
  const inside = (col: number, row: number) =>
    col >= bounds.col && col < bounds.col + bounds.cols && row >= bounds.row && row < bounds.row + bounds.rows;
  const setGround = (col: number, row: number, t: Ground) => { if (inside(col, row)) ground[row - bounds.row][col - bounds.col] = t; };
  const setOverlay = (col: number, row: number, t: Overlay) => { if (inside(col, row)) overlay[row - bounds.row][col - bounds.col] = t; };
  const fill = (r: Rect, t: Ground) => {
    for (let row = r.row; row < r.row + r.rows; row++) for (let col = r.col; col < r.col + r.cols; col++) setGround(col, row, t);
  };

  fill(layout.mainStreet, 'dirt');
  fill(layout.plazaConnector, 'dirt');
  fill(layout.plaza, 'stone');

  for (const yard of layout.yards) {
    const { col, row, cols, rows } = yard.rect;
    // 집 앞에서 남쪽 문까지 흙길
    const houseBottomRow = yard.house.row;
    fill({ col: yard.gate.col, row: houseBottomRow + 1, cols: yard.gate.cols, rows: yard.gate.row - houseBottomRow }, 'dirt');
    // 울타리: 위·아래는 가로, 좌우는 세로, 네 귀퉁이는 모서리. 남쪽 가운데에 문
    for (let c = col; c < col + cols; c++) {
      setOverlay(c, row, 'fence-h');
      const isGate = c >= yard.gate.col && c < yard.gate.col + yard.gate.cols;
      if (!isGate) setOverlay(c, row + rows - 1, 'fence-h');
    }
    for (let r = row; r < row + rows; r++) {
      setOverlay(col, r, 'fence-v');
      setOverlay(col + cols - 1, r, 'fence-v');
    }
    for (const [c, r] of [[col, row], [col + cols - 1, row], [col, row + rows - 1], [col + cols - 1, row + rows - 1]]) {
      setOverlay(c, r, 'fence-corner');
    }
  }
  return { ground, overlay, bounds };
}

export function isBlocked(t: Overlay): boolean {
  return t !== null;
}
