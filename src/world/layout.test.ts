import { describe, expect, it } from 'vitest';
import { MAP_COLS, MAP_ROWS, PLAZA, YARDS, buildTiles, gateCol, isBlocked } from './layout';

/** 막힌 타일을 피해서 from에서 to까지 걸어갈 수 있는지 확인해요. */
function reachable(from: [number, number], to: [number, number]): boolean {
  const tiles = buildTiles();
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    const key = `${c},${r}`;
    if (seen.has(key) || c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS || isBlocked(tiles[r][c])) continue;
    if (c === to[0] && r === to[1]) return true;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return false;
}

describe('동네 맵', () => {
  const plazaCenter: [number, number] = [PLAZA.col + 1, PLAZA.row + 1];

  it('광장에서 모든 마당 안쪽까지 걸어갈 수 있어요', () => {
    for (const yard of YARDS) {
      const inside: [number, number] = [yard.rect.col + 2, yard.rect.row + yard.rect.rows - 3];
      expect(reachable(plazaCenter, inside)).toBe(true);
    }
  });

  it('마당은 문 말고는 울타리로 막혀 있어요', () => {
    const tiles = buildTiles();
    for (const yard of YARDS) {
      const { col, row, cols } = yard.rect;
      const gate = gateCol(yard);
      expect(isBlocked(tiles[row][col])).toBe(true);
      expect(isBlocked(tiles[row][gate])).toBe(false);
      expect(isBlocked(tiles[row][col + cols - 1])).toBe(true);
    }
  });
});
