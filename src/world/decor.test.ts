import { describe, expect, it } from 'vitest';
import { grassTileAt, themeOf, villageDecor, yardDecor } from './decor';
import { createVillageLayout, withMinWidth } from './layout';

const overlaps = (x: number, y: number, rect: { col: number; row: number; cols: number; rows: number }) =>
  x > rect.col && x < rect.col + rect.cols && y > rect.row && y <= rect.row + rect.rows;

describe('마을 꾸미기', () => {
  const layout = withMinWidth(createVillageLayout(['me', 'friend-a', 'friend-b', 'friend-c']), 72, 4);
  const decor = villageDecor(layout);

  it('같은 마을이면 매번 같은 자리에 놓여요', () => {
    expect(villageDecor(layout)).toEqual(decor);
  });

  it('막히는 장식은 큰길·광장 연결 길·마당 문 앞 길을 막지 않아요', () => {
    const blocking = decor.filter((d) => d.block);
    for (const d of blocking) {
      expect(overlaps(d.x, d.y, layout.mainStreet)).toBe(false);
      expect(overlaps(d.x, d.y, layout.plazaConnector)).toBe(false);
      for (const yard of layout.yards) {
        // 집 앞~남쪽 문 길 (가로 3칸 + 양옆 반 칸 여유)
        const path = { col: yard.gate.col - 0.5, row: yard.house.row + 1, cols: yard.gate.cols + 1, rows: yard.gate.row - yard.house.row };
        expect(overlaps(d.x, d.y, path)).toBe(false);
      }
    }
  });

  it('마당 가운데(반죽·주민 자리)는 비워 둬요', () => {
    for (const yard of layout.yards) {
      const middle = { col: yard.rect.col + 8, row: yard.rect.row + 10, cols: 13, rows: 9 };
      expect(yardDecor(yard).filter((d) => d.block && overlaps(d.x, d.y, middle))).toEqual([]);
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
});
