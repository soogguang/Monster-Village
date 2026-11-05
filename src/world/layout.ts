// 동네 맵 배치 (타일 단위)
// Codex가 만든 배치 규격(design/village/layout-template.json)을 바탕으로, 사람이 많아지면 둥글게 퍼지도록 바꿨어요.
// - 집은 모두 남쪽을 봐요. 마당 문은 남쪽, 마당 줄마다 남쪽에 가로길이 있어요.
// - 처음 5명은 광장 위 한 줄(기존 배치 그대로). 그다음부터는 광장에서 가까운 칸부터 둥글게 채우는 바둑판이에요.
// - 길은 단순하게: 마당 줄마다 가로길 하나 + (줄이 여러 개일 때) 광장 양옆 세로길 두 줄
// - 자리 번호(slot)는 DB에 0, 1, -1, 2, -2 … 로 저장되고, 번호 → 칸 순서는 항상 같아서 한 번 정한 집은 움직이지 않아요.
// - 광장과 첫 마당(0번)의 좌표는 고정이고, 왼쪽·위쪽으로 늘어나면 음수 좌표가 생겨요.

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
  /** 마당 줄마다 남쪽에 난 가로길 */
  streets: Rect[];
  /** 마당 줄이 여러 개일 때 광장 양옆을 지나는 세로길 두 줄 */
  avenues: Rect[];
  plaza: Rect;
  plazaConnector: Rect;
  /** 광장 물건 기준점: 바닥 가운데 타일 */
  anchors: { guardianTree: Spot; campfire: Spot; bell: Spot };
  /** 맵 전체 범위. 왼쪽·위쪽으로 늘어나면 col·row가 음수가 돼요 */
  bounds: Rect;
}

/** 바둑판 칸 좌표. gx는 가로(0 = 가운데), gy는 세로(0 = 광장 위 첫 줄, 1 = 광장 줄) */
export interface Cell {
  gx: number;
  gy: number;
}

export const TEMPLATE = {
  yard: {
    origin: { col: 34, row: 3 },
    cols: 28,
    rows: 22,
    strideCols: 32,
    gate: { offsetCols: 12, cols: 3 },
    houseOffset: { col: 14, row: 10 },
    houseTextures: ['house-teal', 'house-clay'],
  },
  /** 마당 줄 하나의 높이: 마당 22 + 가로길 3 + 풀밭 3 */
  bandRows: 28,
  street: { offsetRows: 22, rows: 3 },
  /** 광장 양옆 세로길 (마당 사이 4칸 틈 중 3칸) */
  avenueCols: [30, 62],
  roadCols: 3,
  plaza: { col: 34, row: 30, cols: 28, rows: 18 },
  plazaConnector: { col: 46, row: 28, cols: 3, rows: 2 },
  anchors: {
    guardianTree: { col: 39, row: 46 },
    campfire: { col: 49, row: 46 },
    bell: { col: 58, row: 45 },
  },
  boundsPaddingCols: 2,
  boundsPaddingRows: { top: 3, bottom: 2 },
} as const;

/** 광장이 차지하는 칸 */
export const PLAZA_CELL: Cell = { gx: 0, gy: 1 };

/** i번째로 배정되는 자리 번호: 0, 1, -1, 2, -2, … (DB에 저장되는 값) */
export function slotAt(index: number): number {
  if (index === 0) return 0;
  return index % 2 === 0 ? -index / 2 : (index + 1) / 2;
}

/** 자리 번호 → 몇 번째 자리인지 (slotAt의 반대) */
export function slotIndex(slot: number): number {
  return slot === 0 ? 0 : slot > 0 ? slot * 2 - 1 : -slot * 2;
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

// ---------------------------------------------------------------- 둥글게 퍼지는 바둑판

/** 처음 5명은 광장 위 한 줄 (가운데 → 오른쪽 → 왼쪽 → …) */
const FIRST_ROW: Cell[] = [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: -1, gy: 0 }, { gx: 2, gy: 0 }, { gx: -2, gy: 0 }];

/** 광장 가운데와의 거리 (타일 단위) */
function distanceToPlaza(c: Cell): number {
  return Math.hypot(c.gx * TEMPLATE.yard.strideCols, (c.gy - PLAZA_CELL.gy) * TEMPLATE.bandRows);
}

let spiral: Cell[] = [...FIRST_ROW];
let spiralRadius = 0;

/**
 * n번째 자리의 칸. 처음 5칸은 광장 위 한 줄이고, 그다음부터는 광장에서 가까운 칸부터 둥글게 채워요.
 * 순서는 항상 같아서, 사람이 늘어도 이미 정해진 칸은 바뀌지 않아요.
 */
export function cellAt(index: number): Cell {
  while (spiral.length <= index) {
    spiralRadius += 2;
    const R = spiralRadius;
    const reach = R * Math.min(TEMPLATE.yard.strideCols, TEMPLATE.bandRows);
    const taken = new Set([...FIRST_ROW, PLAZA_CELL].map((c) => `${c.gx},${c.gy}`));
    const candidates: Cell[] = [];
    for (let gy = PLAZA_CELL.gy - R; gy <= PLAZA_CELL.gy + R; gy++) {
      for (let gx = -R; gx <= R; gx++) {
        const cell = { gx, gy };
        // 이 반지름 안의 칸이 모두 들어왔을 때만 순서를 확정해요.
        if (!taken.has(`${gx},${gy}`) && distanceToPlaza(cell) <= reach) candidates.push(cell);
      }
    }
    candidates.sort(
      (a, b) =>
        distanceToPlaza(a) - distanceToPlaza(b) ||
        Math.abs(a.gx) - Math.abs(b.gx) ||
        Number(a.gx < 0) - Number(b.gx < 0) ||
        b.gy - a.gy,
    );
    spiral = [...FIRST_ROW, ...candidates];
  }
  return spiral[index];
}

export function cellOfSlot(slot: number): Cell {
  return cellAt(slotIndex(slot));
}

function cellRect(cell: Cell): Rect {
  const { yard, bandRows } = TEMPLATE;
  return { col: yard.origin.col + cell.gx * yard.strideCols, row: yard.origin.row + cell.gy * bandRows, cols: yard.cols, rows: yard.rows };
}

function streetRow(gy: number): number {
  return TEMPLATE.yard.origin.row + gy * TEMPLATE.bandRows + TEMPLATE.street.offsetRows;
}

export function createVillageLayout(memberIds: string[], previous: SlotAssignment[] = []): VillageLayout {
  const assignments = assignSlots(memberIds, previous);
  const { yard, plaza, roadCols } = TEMPLATE;
  const [leftAvenue, rightAvenue] = TEMPLATE.avenueCols;

  const yards: YardPlan[] = memberIds.map((userId) => {
    const slot = assignments.get(userId)!;
    const rect = cellRect(cellOfSlot(slot));
    return {
      userId,
      slot,
      rect,
      gate: { col: rect.col + yard.gate.offsetCols, row: rect.row + yard.rows - 1, cols: yard.gate.cols, rows: 1 },
      house: {
        col: rect.col + yard.houseOffset.col,
        row: rect.row + yard.houseOffset.row,
        texture: yard.houseTextures[slotIndex(slot) % yard.houseTextures.length],
      },
    };
  });

  // 나간 멤버의 자리까지 포함해서 길과 범위를 잡아요. (사람이 나가도 다른 집과 길이 움직이지 않게)
  const cells = [...assignments.values()].map(cellOfSlot);
  const bands = [...new Set(cells.map((c) => c.gy))].sort((a, b) => a - b);

  // 가로길: 마당 줄마다 하나. 그 줄의 마당 범위만큼 + 광장 양옆 세로길까지 닿게
  const streets: Rect[] = bands.map((gy) => {
    const inBand = cells.filter((c) => c.gy === gy).map(cellRect);
    const left = Math.min(leftAvenue, ...inBand.map((r) => r.col));
    const right = Math.max(rightAvenue + roadCols, ...inBand.map((r) => r.col + r.cols));
    return { col: left, row: streetRow(gy), cols: right - left, rows: TEMPLATE.street.rows };
  });

  // 세로길: 마당 줄이 둘 이상일 때만, 광장 양옆 두 줄로 모든 가로길을 이어요.
  const avenues: Rect[] = [];
  if (bands.length > 1) {
    const top = streetRow(bands[0]);
    const bottom = streetRow(bands[bands.length - 1]) + TEMPLATE.street.rows;
    for (const col of TEMPLATE.avenueCols) avenues.push({ col, row: top, cols: roadCols, rows: bottom - top });
  }

  const allRects = [...cells.map(cellRect), ...streets, plaza];
  const left = Math.min(...allRects.map((r) => r.col));
  const right = Math.max(...allRects.map((r) => r.col + r.cols));
  const top = Math.min(...cells.map((c) => cellRect(c).row), plaza.row) - TEMPLATE.boundsPaddingRows.top;
  const bottom = Math.max(...allRects.map((r) => r.row + r.rows)) + TEMPLATE.boundsPaddingRows.bottom;
  const pad = TEMPLATE.boundsPaddingCols;
  return {
    assignments: [...assignments].map(([userId, slot]) => ({ userId, slot })),
    yards,
    streets,
    avenues,
    plaza: { ...plaza },
    plazaConnector: { ...TEMPLATE.plazaConnector },
    anchors: {
      guardianTree: { ...TEMPLATE.anchors.guardianTree },
      campfire: { ...TEMPLATE.anchors.campfire },
      bell: { ...TEMPLATE.anchors.bell },
    },
    bounds: { col: left - pad, row: top, cols: right - left + pad * 2, rows: bottom - top },
  };
}

/** 가로길·세로길·광장 연결 길 전부 */
export function roadsOf(layout: VillageLayout): Rect[] {
  return [...layout.streets, ...layout.avenues, layout.plazaConnector];
}

/**
 * 맵이 화면보다 좁으면(혼자이거나 멤버가 적을 때) 양옆에 풀밭을 넓혀서 최소 폭을 맞춰요.
 * 길은 늘리지 않아요(풀밭이 길로 어수선해지지 않게). 마당·광장 좌표는 그대로예요.
 */
export function withMinWidth(layout: VillageLayout, minCols: number, extraRows = 0): VillageLayout {
  const extra = minCols - layout.bounds.cols;
  if (extra <= 0 && extraRows === 0) return layout;
  const left = Math.max(0, Math.floor(extra / 2));
  const bounds = { col: layout.bounds.col - left, row: layout.bounds.row, cols: Math.max(minCols, layout.bounds.cols), rows: layout.bounds.rows + extraRows };
  return { ...layout, bounds };
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

/** 집 그림의 크기(타일). 320×320 그림 = 10×10칸 */
export const HOUSE_TILES = 10;

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

  for (const road of roadsOf(layout)) fill(road, 'dirt');
  fill(layout.plaza, 'stone');

  for (const yard of layout.yards) {
    const { col, row, cols, rows } = yard.rect;
    // 큰 집 앞에는 작은 돌 테라스를 두고, 그 가운데에서 남쪽 길이 시작돼요.
    fill({ col: yard.house.col - HOUSE_TILES / 2, row: yard.house.row + 1, cols: HOUSE_TILES, rows: 2 }, 'stone');
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
