// 동네 맵 배치 (타일 단위)
// 위쪽 가운데에 광장, 아래쪽에 마당 세 개(왼쪽 친구, 가운데 나, 오른쪽 친구)가 있어요.
// 마당은 울타리로 둘러싸여 있고, 위쪽 가운데의 문으로 드나들어요.

export type Tile = 'grass' | 'dirt' | 'stone' | 'fence-h' | 'fence-v';

export interface Rect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export interface Yard {
  owner: 'me' | 'friend';
  name: string;
  rect: Rect;
}

export const MAP_COLS = 96;
export const MAP_ROWS = 44;

const YARD_COLS = 28;
const YARD_ROWS = 22;
const YARD_TOP = 19;
const GATE_WIDTH = 3;

export const PLAZA: Rect = { col: 36, row: 2, cols: 24, rows: 12 };

export const YARDS: Yard[] = [
  { owner: 'friend', name: '친구 A의 마당', rect: { col: 2, row: YARD_TOP, cols: YARD_COLS, rows: YARD_ROWS } },
  { owner: 'me', name: '내 마당', rect: { col: 34, row: YARD_TOP, cols: YARD_COLS, rows: YARD_ROWS } },
  { owner: 'friend', name: '친구 B의 마당', rect: { col: 66, row: YARD_TOP, cols: YARD_COLS, rows: YARD_ROWS } },
];

/** 광장 안 물건 위치 (타일 좌표) */
export const PLAZA_SPOTS = {
  campfire: { col: PLAZA.col + 12, row: PLAZA.row + 6 },
  pledgeTree: { col: PLAZA.col + 4, row: PLAZA.row + 4 },
  bell: { col: PLAZA.col + 20, row: PLAZA.row + 4 },
};

export function gateCol(yard: Yard): number {
  return yard.rect.col + Math.floor((yard.rect.cols - GATE_WIDTH) / 2);
}

export function buildTiles(): Tile[][] {
  const tiles: Tile[][] = Array.from({ length: MAP_ROWS }, () => Array<Tile>(MAP_COLS).fill('grass'));
  const set = (col: number, row: number, t: Tile) => {
    if (row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS) tiles[row][col] = t;
  };

  fill(PLAZA, (c, r) => set(c, r, 'stone'));

  // 광장에서 각 마당 문까지 흙길
  const pathRow = PLAZA.row + PLAZA.rows + 2;
  for (const yard of YARDS) {
    const gate = gateCol(yard);
    for (let r = pathRow; r < yard.rect.row; r++) for (let c = gate; c < gate + GATE_WIDTH; c++) set(c, r, 'dirt');
  }
  const firstGate = gateCol(YARDS[0]);
  const lastGate = gateCol(YARDS[YARDS.length - 1]) + GATE_WIDTH;
  for (let c = firstGate; c < lastGate; c++) for (let r = pathRow; r < pathRow + GATE_WIDTH; r++) set(c, r, 'dirt');
  const plazaExit = PLAZA.col + Math.floor((PLAZA.cols - GATE_WIDTH) / 2);
  for (let r = PLAZA.row + PLAZA.rows; r < pathRow; r++) for (let c = plazaExit; c < plazaExit + GATE_WIDTH; c++) set(c, r, 'dirt');

  // 맵 테두리
  for (let c = 0; c < MAP_COLS; c++) {
    set(c, 0, 'fence-h');
    set(c, MAP_ROWS - 1, 'fence-h');
  }
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    set(0, r, 'fence-v');
    set(MAP_COLS - 1, r, 'fence-v');
  }

  // 마당 울타리 (위쪽 가운데는 문)
  for (const yard of YARDS) {
    const { col, row, cols, rows } = yard.rect;
    const gate = gateCol(yard);
    for (let c = col; c < col + cols; c++) {
      if (c < gate || c >= gate + GATE_WIDTH) set(c, row, 'fence-h');
      set(c, row + rows - 1, 'fence-h');
    }
    for (let r = row + 1; r < row + rows - 1; r++) {
      set(col, r, 'fence-v');
      set(col + cols - 1, r, 'fence-v');
    }
  }
  return tiles;
}

export function isBlocked(tile: Tile): boolean {
  return tile === 'fence-h' || tile === 'fence-v';
}

function fill(rect: Rect, fn: (col: number, row: number) => void): void {
  for (let r = rect.row; r < rect.row + rect.rows; r++) for (let c = rect.col; c < rect.col + rect.cols; c++) fn(c, r);
}
