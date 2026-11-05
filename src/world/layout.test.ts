import { describe, expect, it } from 'vitest';
import { assignSlots, buildTiles, createVillageLayout, isBlocked, slotAt, withMinWidth, type VillageLayout } from './layout';

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
    expect(new Set(layout.yards.map((y) => y.rect.col)).size).toBe(1000);
  });

  it('맵이 좁으면 양옆을 넓히고 큰길도 늘리지만, 마당과 광장은 그대로예요', () => {
    const one = createVillageLayout(['me']);
    const wide = withMinWidth(one, 72);
    expect(wide.bounds.cols).toBe(72);
    expect(wide.mainStreet.cols).toBe(72);
    expect(wide.yards[0].rect).toEqual(one.yards[0].rect);
    expect(wide.plaza).toEqual(one.plaza);
    const three = createVillageLayout(['a', 'b', 'c']);
    expect(withMinWidth(three, 72)).toBe(three); // 이미 넓으면 그대로
  });
});
