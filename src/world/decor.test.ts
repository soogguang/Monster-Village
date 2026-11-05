import { describe, expect, it } from 'vitest';
import { grassTileAt, themeOf, villageDecor, worldBlocks, yardDecor } from './decor';
import { buildTiles, createVillageLayout, roadsOf, withMinWidth, type Rect } from './layout';

const overlaps = (x: number, y: number, rect: { col: number; row: number; cols: number; rows: number }) =>
  x > rect.col && x < rect.col + rect.cols && y > rect.row && y <= rect.row + rect.rows;
const intersects = (a: Rect, b: Rect) => a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows;

describe('마을 꾸미기', () => {
  const layout = withMinWidth(createVillageLayout(Array.from({ length: 12 }, (_, i) => `member-${i}`)), 72, 4);
  const decor = villageDecor(layout);

  it('같은 마을이면 매번 같은 자리에 놓여요', () => {
    expect(villageDecor(layout)).toEqual(decor);
  });

  it('막히는 장식은 가로길·세로길·광장 연결 길·마당 문 앞 길을 막지 않아요 (12명 마을)', () => {
    const blocking = decor.filter((d) => d.block);
    for (const d of blocking) {
      const area = { col: d.x - d.block!.w / 2, row: d.y - d.block!.h, cols: d.block!.w, rows: d.block!.h };
      for (const road of roadsOf(layout)) expect(intersects(area, road), `${d.key} at ${d.x},${d.y}`).toBe(false);
      for (const yard of layout.yards) {
        // 집 앞~남쪽 문 길 (가로 3칸 + 양옆 반 칸 여유)
        const path = { col: yard.gate.col - 0.5, row: yard.house.row + 1, cols: yard.gate.cols + 1, rows: yard.gate.row - yard.house.row };
        expect(intersects(area, path), `${d.key} at ${d.x},${d.y}`).toBe(false);
      }
    }
  });

  it('마당 가운데(반죽·주민 자리)는 비워 둬요', () => {
    for (const yard of layout.yards) {
      // 큰 집 앞 테라스 아래쪽이 주민 활동 공간이에요.
      const middle = { col: yard.rect.col + 8, row: yard.rect.row + 14, cols: 13, rows: 6 };
      expect(yardDecor(yard).filter((d) => d.block && intersects({ col: d.x - d.block.w / 2, row: d.y - d.block.h, cols: d.block.w, rows: d.block.h }, middle))).toEqual([]);
    }
  });

  it('마당마다 테마가 정해지고, 마당 안 꽃 풀밭은 그 테마의 꽃이에요', () => {
    const yard = layout.yards[0];
    const theme = themeOf(yard);
    const words = { sunny: ['daisy', 'buttercup'], violet: ['lavender', 'bluebell'], picnic: ['cosmos', 'tulip'] }[theme];
    for (let row = yard.rect.row; row < yard.rect.row + yard.rect.rows; row++) {
      for (let col = yard.rect.col; col < yard.rect.col + yard.rect.cols; col++) {
        const tile = grassTileAt(layout, col, row);
        if (!/^grass-0\d$/.test(tile)) expect(words.some((w) => tile.includes(w))).toBe(true);
      }
    }
  });

  it('바깥 풀밭에도 장식이 충분히 있어서 텅 비어 보이지 않아요', () => {
    const outside = decor.filter((d) => !layout.yards.some((y) => overlaps(d.x, d.y, y.rect)) && !overlaps(d.x, d.y, layout.plaza));
    expect(outside.length).toBeGreaterThan(40);
  });

  it('커진 집·나무·가구와 플레이어 발밑 폭까지 고려해도 광장에서 모든 마당까지 걸어갈 수 있어요', () => {
    const { bounds, overlay } = buildTiles(layout);
    const blocked = overlay.map((row) => row.map((tile) => tile !== null));
    for (const area of worldBlocks(layout, decor)) {
      for (let row = Math.floor(area.row); row <= Math.ceil(area.row + area.rows + 0.5); row++) {
        for (let col = Math.floor(area.col - 0.375); col <= Math.ceil(area.col + area.cols + 0.375); col++) {
          const ci = col - bounds.col, ri = row - bounds.row;
          if (ci < 0 || ci >= bounds.cols || ri < 0 || ri >= bounds.rows) continue;
          // 24×12px인 실제 플레이어 몸체를 타일 가운데에 놓고 통과 가능 여부를 봐요.
          if (intersects({ col: col + 0.125, row, cols: 0.75, rows: 0.375 }, area)) blocked[ri][ci] = true;
        }
      }
    }
    const start = { col: layout.plazaConnector.col + 1, row: layout.plazaConnector.row + 1 };
    const queue = [start];
    const visited = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const { col, row } = queue[i];
      const ci = col - bounds.col, ri = row - bounds.row, key = `${col},${row}`;
      if (ci < 0 || ci >= bounds.cols || ri < 0 || ri >= bounds.rows || blocked[ri][ci] || visited.has(key)) continue;
      visited.add(key);
      queue.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
    }
    for (const yard of layout.yards) {
      expect(visited.has(`${yard.gate.col + 1},${yard.house.row + 4}`), yard.userId).toBe(true);
    }
    expect(visited.has(`${layout.anchors.campfire.col},${layout.anchors.campfire.row - 3}`)).toBe(true);
    expect(visited.has(`${layout.anchors.bell.col},${layout.anchors.bell.row + 1}`)).toBe(true);
  });
});
