import { describe, expect, it } from 'vitest';
import { HOUSE_TILES, assignSlots, buildTiles, cellAt, createVillageLayout, isBlocked, slotAt, withMinWidth, type VillageLayout } from './layout';

/** 막힌 타일을 피해서 from에서 to까지 걸어갈 수 있는지 확인해요. (집·광장 물건은 화면 쪽 충돌이라 여기서는 울타리만 봐요) */
function reachable(layout: VillageLayout, from: [number, number], to: [number, number]): boolean {
  const { overlay, bounds } = buildTiles(layout);
  const seen = new Set<string>();
  const queue: [number, number][] = [from];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    const key = `${c},${r}`;
    const ci = c - bounds.col;
    const ri = r - bounds.row;
    if (seen.has(key) || ci < 0 || ri < 0 || ci >= bounds.cols || ri >= bounds.rows || isBlocked(overlay[ri][ci])) continue;
    if (c === to[0] && r === to[1]) return true;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return false;
}

describe('자리 배정', () => {
  it('가운데 0, 오른쪽 1, 왼쪽 -1, 오른쪽 2, 왼쪽 -2 순서예요', () => {
    expect([0, 1, 2, 3, 4].map(slotAt)).toEqual([0, 1, -1, 2, -2]);
  });

  it('새 멤버가 들어와도 기존 자리는 바뀌지 않아요', () => {
    const first = assignSlots(['a', 'b', 'c']);
    const prev = [...first].map(([userId, slot]) => ({ userId, slot }));
    const second = assignSlots(['d', 'c', 'a', 'b'], prev);
    expect(['a', 'b', 'c'].map((id) => second.get(id))).toEqual([0, 1, -1]);
    expect(second.get('d')).toBe(2);
  });

  it('나간 멤버의 자리는 비워 두고, 다시 오면 같은 자리예요', () => {
    const prev = [{ userId: 'a', slot: 0 }, { userId: 'b', slot: 1 }, { userId: 'c', slot: -1 }];
    const withoutB = assignSlots(['a', 'c', 'd'], prev);
    expect(withoutB.get('d')).toBe(2);
    expect(assignSlots(['a', 'b', 'c', 'd'], [...withoutB].map(([userId, slot]) => ({ userId, slot }))).get('b')).toBe(1);
  });
});

describe('동네 맵', () => {
  it('큰 집이 마당 안에 들어가고 테라스와 남쪽 길이 이어져요', () => {
    const layout = createVillageLayout(['me']);
    const yard = layout.yards[0];
    expect(yard.house.row + 1 - HOUSE_TILES).toBeGreaterThan(yard.rect.row);
    const { ground, bounds } = buildTiles(layout);
    const at = (col: number, row: number) => ground[row - bounds.row][col - bounds.col];
    expect(at(yard.house.col - 3, yard.house.row + 1)).toBe('stone');
    expect(at(yard.gate.col + 1, yard.house.row + 1)).toBe('dirt');
    expect(at(yard.gate.col + 1, yard.gate.row)).toBe('dirt');
  });
  it('혼자일 때도 광장에서 내 마당 안쪽까지 걸어갈 수 있어요', () => {
    const layout = createVillageLayout(['me']);
    const yard = layout.yards[0];
    expect(reachable(layout, [layout.plaza.col + 1, layout.plaza.row + 1], [yard.rect.col + 2, yard.rect.row + 15])).toBe(true);
  });

  it('5명이면 마당이 좌우로 늘어나고, 모든 마당까지 걸어갈 수 있어요', () => {
    const layout = createVillageLayout(['a', 'b', 'c', 'd', 'e']);
    expect(layout.yards.map((y) => y.slot)).toEqual([0, 1, -1, 2, -2]);
    expect(layout.bounds.col).toBeLessThan(0);
    for (const yard of layout.yards) {
      expect(reachable(layout, [layout.plaza.col + 1, layout.plaza.row + 1], [yard.rect.col + 2, yard.rect.row + 15])).toBe(true);
    }
  });

  it('마당은 남쪽 문 말고는 울타리로 막혀 있어요', () => {
    const layout = createVillageLayout(['me']);
    const { overlay, bounds } = buildTiles(layout);
    const at = (c: number, r: number) => overlay[r - bounds.row][c - bounds.col];
    const { rect, gate } = layout.yards[0];
    expect(isBlocked(at(gate.col, gate.row))).toBe(false);
    expect(isBlocked(at(gate.col - 1, gate.row))).toBe(true);
    expect(isBlocked(at(rect.col + 13, rect.row))).toBe(true); // 북쪽에는 문이 없어요
  });

  it('사람이 늘어도 광장과 첫 마당 좌표는 그대로예요', () => {
    const one = createVillageLayout(['a']);
    const many = createVillageLayout(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(many.plaza).toEqual(one.plaza);
    expect(many.yards[0].rect).toEqual(one.yards[0].rect);
  });

  it('1,000명까지 자리가 겹치지 않아요', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `u${i}`);
    const layout = createVillageLayout(ids);
    expect(new Set(layout.yards.map((y) => `${y.rect.col},${y.rect.row}`)).size).toBe(1000);
    // 마당끼리도 광장과도 겹치지 않아요
    const rects = [...layout.yards.map((y) => y.rect), layout.plaza];
    const hit = (a: (typeof rects)[number], b: (typeof rects)[number]) =>
      a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(hit(rects[i], rects[j])).toBe(false);
  });

  it('맵이 좁으면 양옆 풀밭만 넓히고, 길·마당·광장은 그대로예요', () => {
    const one = createVillageLayout(['me']);
    const wide = withMinWidth(one, 72);
    expect(wide.bounds.cols).toBe(72);
    expect(wide.streets).toEqual(one.streets);
    expect(wide.yards[0].rect).toEqual(one.yards[0].rect);
    expect(wide.plaza).toEqual(one.plaza);
    const three = createVillageLayout(['a', 'b', 'c']);
    expect(withMinWidth(three, 72)).toBe(three); // 이미 넓으면 그대로
  });
});

/** 흙길·돌바닥만 밟아서 광장에서 to까지 갈 수 있는지 (길이 끊기지 않았는지) */
function onRoads(layout: VillageLayout, to: [number, number]): boolean {
  const { ground, bounds } = buildTiles(layout);
  const from: [number, number] = [layout.plaza.col + 1, layout.plaza.row + 1];
  const seen = new Set<string>();
  const queue: [number, number][] = [from];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    const key = `${c},${r}`;
    const ci = c - bounds.col;
    const ri = r - bounds.row;
    if (seen.has(key) || ci < 0 || ri < 0 || ci >= bounds.cols || ri >= bounds.rows || ground[ri][ci] === 'grass') continue;
    if (c === to[0] && r === to[1]) return true;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return false;
}

describe('사람이 늘면 둥글게 퍼져요', () => {
  it('처음 5명은 광장 위 한 줄 그대로예요', () => {
    expect([0, 1, 2, 3, 4].map(cellAt)).toEqual([
      { gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: -1, gy: 0 }, { gx: 2, gy: 0 }, { gx: -2, gy: 0 },
    ]);
  });

  it('6번째부터는 광장 가까운 칸(광장 아래·양옆)부터 채워요', () => {
    expect([5, 6, 7].map(cellAt)).toEqual([{ gx: 0, gy: 2 }, { gx: 1, gy: 1 }, { gx: -1, gy: 1 }]);
  });

  it('사람이 늘어도 먼저 온 사람의 마당은 움직이지 않아요', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    const few = createVillageLayout(ids.slice(0, 8));
    const many = createVillageLayout(ids);
    expect(many.yards.slice(0, 8).map((y) => y.rect)).toEqual(few.yards.map((y) => y.rect));
  });

  it('25명이어도 광장에서 모든 마당 안까지 걸어갈 수 있고, 모든 문 앞이 길로 이어져요', () => {
    const layout = createVillageLayout(Array.from({ length: 25 }, (_, i) => `u${i}`));
    for (const yard of layout.yards) {
      expect(reachable(layout, [layout.plaza.col + 1, layout.plaza.row + 1], [yard.rect.col + 2, yard.rect.row + 15])).toBe(true);
      expect(onRoads(layout, [yard.gate.col + 1, yard.gate.row + 1])).toBe(true);
    }
  });

  it('길은 단순해요: 한 줄이면 세로길 없음, 여러 줄이어도 세로길은 두 줄뿐', () => {
    const five = createVillageLayout(['a', 'b', 'c', 'd', 'e']);
    expect(five.streets).toHaveLength(1);
    expect(five.avenues).toHaveLength(0);
    const many = createVillageLayout(Array.from({ length: 40 }, (_, i) => `u${i}`));
    expect(many.avenues).toHaveLength(2);
    expect(many.streets).toHaveLength(new Set(many.yards.map((y) => y.rect.row)).size);
  });
});
