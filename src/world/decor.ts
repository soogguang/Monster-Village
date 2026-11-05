// 마을 꾸미기 배치 (Codex 장식 아트 + design/village/decor/README.md 배치 기준)
// - 마당마다 정원 테마를 하나 정해요: 햇살 / 보라 숲 / 분홍 소풍. 주인 userId로 고정돼서 매번 같아요.
// - 나무·관목·꽃·돌을 묶어서 마당 가장자리와 집 주변에 두고, 가운데(반죽·주민 자리)와 길은 비워요.
// - 마당 밖(위쪽 숲, 마당 사이, 광장 주변)에도 나무와 꽃을 채워요.
// 화면과 무관한 순수 계산이라 테스트할 수 있어요. 위치는 픽셀이 아니라 타일 단위(소수 가능)예요.

import { HOUSE_TILES, roadsOf, type Rect, type VillageLayout, type YardPlan } from './layout';

export type DecorLayer = 'ground' | 'sorted';

export interface DecorItem {
  key: string;
  /** 발밑 가운데 (타일 단위) */
  x: number;
  y: number;
  /** ground: 바닥 장식(캐릭터 아래), sorted: 발밑 y로 앞뒤 정렬 */
  layer: DecorLayer;
  /** 부딪힘 상자 (타일 단위, 발밑 기준 가로 × 세로). 꽃·풀처럼 지나갈 수 있으면 없음 */
  block?: { w: number; h: number };
}

export type GardenTheme = 'sunny' | 'violet' | 'picnic';
const THEMES: GardenTheme[] = ['sunny', 'violet', 'picnic'];

/** 바닥 장식 타일 (풀 위에 꽃이 피어 있는 타일) */
export const MEADOW_TILES = [
  'grass-daisy-sparse', 'grass-daisy-dense', 'grass-buttercup-sparse', 'grass-buttercup-dense',
  'grass-lavender-sparse', 'grass-lavender-dense', 'grass-bluebell-sparse', 'grass-bluebell-dense',
  'grass-cosmos-sparse', 'grass-cosmos-dense', 'grass-tulip-sparse', 'grass-tulip-dense',
  'grass-flowers-mixed-01', 'grass-flowers-mixed-02', 'grass-fern', 'grass-mushrooms',
] as const;

const THEME_STYLE: Record<GardenTheme, { flowers: string[]; meadow: string[]; trees: [string, string]; bush: string }> = {
  sunny: {
    flowers: ['decor-flowers-daisy', 'decor-flowers-buttercup'],
    meadow: ['grass-daisy-sparse', 'grass-buttercup-sparse', 'grass-daisy-dense', 'grass-buttercup-dense'],
    trees: ['decor-tree-round', 'decor-tree-citrus'],
    bush: 'decor-bush-round',
  },
  violet: {
    flowers: ['decor-flowers-lavender', 'decor-flowers-bluebell'],
    meadow: ['grass-lavender-sparse', 'grass-bluebell-sparse', 'grass-lavender-dense', 'grass-bluebell-dense'],
    trees: ['decor-tree-birch', 'decor-tree-round'],
    bush: 'decor-bush-hydrangea',
  },
  picnic: {
    flowers: ['decor-flowers-cosmos', 'decor-flowers-tulip'],
    meadow: ['grass-cosmos-sparse', 'grass-tulip-sparse', 'grass-cosmos-dense', 'grass-tulip-dense'],
    trees: ['decor-tree-blossom', 'decor-tree-round'],
    bush: 'decor-bush-blossom',
  },
};

/** 장식별 부딪힘 상자 (실제 발밑만). 없는 건 지나갈 수 있어요 */
const BLOCKS: Record<string, { w: number; h: number }> = {
  'decor-tree-round': { w: 1.2, h: 0.6 }, 'decor-tree-birch': { w: 0.9, h: 0.6 },
  'decor-tree-blossom': { w: 1.2, h: 0.6 }, 'decor-tree-citrus': { w: 1.2, h: 0.6 },
  'decor-bush-round': { w: 2.25, h: 0.6 }, 'decor-bush-hydrangea': { w: 1.8, h: 0.6 }, 'decor-bush-blossom': { w: 1.8, h: 0.6 },
  'decor-hedge': { w: 2.25, h: 0.75 }, 'decor-moss-rocks': { w: 2.4, h: 0.75 },
  'decor-planter-daisy': { w: 2.4, h: 0.75 }, 'decor-pot-lavender': { w: 0.9, h: 0.45 },
  'decor-flower-border': { w: 2.4, h: 0.9 }, 'decor-flowerbed-round': { w: 2.4, h: 0.9 },
  'decor-seedling-tray': { w: 1.8, h: 0.6 }, 'decor-bench': { w: 3.9, h: 0.75 }, 'decor-mailbox': { w: 0.6, h: 0.45 },
  'decor-lantern': { w: 0.6, h: 0.45 }, 'decor-stump': { w: 1.05, h: 0.6 }, 'decor-well': { w: 3.6, h: 1.2 },
  'decor-noticeboard': { w: 2.4, h: 0.45 }, 'decor-wheelbarrow': { w: 2.1, h: 0.6 },
};

/** 바닥에 깔리는 장식 (캐릭터가 위로 지나가요) */
const GROUND_KEYS = new Set([
  'decor-fern', 'decor-meadow-grass', 'decor-mushrooms', 'decor-picnic', 'decor-watering-can',
  'decor-flowers-daisy', 'decor-flowers-buttercup', 'decor-flowers-lavender',
  'decor-flowers-cosmos', 'decor-flowers-bluebell', 'decor-flowers-tulip',
]);

function item(key: string, x: number, y: number): DecorItem {
  return { key, x, y, layer: GROUND_KEYS.has(key) ? 'ground' : 'sorted', block: BLOCKS[key] };
}

// ---------------------------------------------------------------- 고정 난수

/** 글자로 정해지는 숫자 (같은 글자면 항상 같은 값) */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 위치마다 고정된 0~1 값 */
function noise(a: number, b: number, salt = 0): number {
  const h = Math.abs(Math.sin(a * 12.9898 + b * 78.233 + salt * 37.719) * 43758.5453);
  return h - Math.floor(h);
}

function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

export function themeOf(yard: Pick<YardPlan, 'userId'>): GardenTheme {
  return THEMES[hashString(yard.userId) % THEMES.length];
}

// ---------------------------------------------------------------- 마당 장식

/**
 * 마당 하나의 장식. 위치는 마당 왼쪽 위(col, row) 기준으로 정해요.
 * 왼쪽은 그늘 쉼터, 오른쪽은 꽃·원예 공간. 큰 집 앞은 테라스예요.
 * 집 앞~남쪽 문 길(가로 12~15칸)과 아래 가운데(가로 8~21칸, 세로 14~20칸)는 비워요.
 */
export function yardDecor(yard: YardPlan): DecorItem[] {
  const { col: c, row: r } = yard.rect;
  const theme = themeOf(yard);
  const style = THEME_STYLE[theme];
  const at = (key: string, dx: number, dy: number) => item(key, c + dx, r + dy);
  const items: DecorItem[] = [];

  // 96px 생울타리를 72px 간격으로 잇고, 높이가 다른 나무를 겹쳐 그늘을 만들어요.
  for (const start of [3.3, 20.2]) for (let i = 0; i < 3; i++) items.push(at('decor-hedge', start + i * 2.25, 2.6));
  items.push(at(style.trees[0], 3.6, 7.8), at(style.trees[0], 7, 5.4), at(style.trees[1], 24.6, 7.6));
  items.push(at('decor-planter-daisy', 10, 12.8), at('decor-planter-daisy', 18, 12.8), at('decor-mailbox', 7.7, 12.8));
  items.push(at('decor-bench', 5.4, 13.4), at('decor-picnic', 5, 18));

  // 한 무리 안에서만 불규칙하게 겹쳐요. 사용자 ID와 무리별 seed가 같으면 위치도 같아요.
  const patch = (cx: number, cy: number, keys: string[], count: number, rx: number, ry: number) => {
    const rand = seeded(hashString(`${yard.userId}:${cx}:${cy}`));
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + rand() * 0.3;
      const radius = Math.sqrt((i + 0.5) / count);
      items.push(at(keys[i % keys.length], cx + Math.cos(angle) * radius * rx, cy + Math.sin(angle) * radius * ry));
    }
  };
  patch(3.6, 11.4, [style.bush, ...style.flowers, 'decor-fern'], 7, 1.15, 1.35);
  patch(3.6, 19.5, ['decor-moss-rocks', 'decor-fern', ...style.flowers, 'decor-flowerbed-round'], 7, 1.4, 0.8);
  patch(24.8, 11.4, [style.bush, ...style.flowers, 'decor-fern'], 7, 1.1, 1.35);
  patch(24.2, 19.5, ['decor-flower-border', ...style.flowers, 'decor-moss-rocks', 'decor-mushrooms'], 7, 1.4, 0.8);
  patch(6.6, 15.8, [...style.flowers, 'decor-meadow-grass'], 5, 0.7, 1.4);
  patch(22.2, 16.2, [...style.flowers, 'decor-meadow-grass'], 5, 0.6, 1.4);

  // 원예 공간의 소품은 테마에 맞춰 한쪽에 모아요.
  if (theme === 'sunny') {
    items.push(at('decor-seedling-tray', 23, 15.4), at('decor-seedling-tray', 25.3, 15.9));
    items.push(at('decor-wheelbarrow', 24.6, 17.5), at('decor-watering-can', 25.8, 18.3));
  } else if (theme === 'violet') {
    items.push(at('decor-well', 24.2, 14.7), at('decor-pot-lavender', 20.4, 12.3));
  } else {
    items.push(at('decor-bench', 24.2, 15.3), at('decor-pot-lavender', 20.4, 12.3));
  }
  return items;
}

// ---------------------------------------------------------------- 광장과 마을 바깥

export function plazaDecor(layout: VillageLayout): DecorItem[] {
  const { plaza, anchors } = layout;
  const fire = anchors.campfire;
  const fx = fire.col + 0.5;
  const fy = fire.row + 1;
  const bottom = plaza.row + plaza.rows;
  return [
    // 모닥불 둘레의 그루터기 의자와 뒤쪽 벤치
    item('decor-stump', fx - 5, fy + 0.1), item('decor-stump', fx + 5, fy + 0.1),
    item('decor-stump', fx - 4.5, fy - 3.5), item('decor-stump', fx + 4.5, fy - 3.5),
    item('decor-bench', anchors.guardianTree.col + 5, bottom - 0.5),
    item('decor-bench', plaza.col + 22.5, plaza.row + 5.4),
    // 광장 입구 옆 게시판, 양쪽 아래 등불
    item('decor-noticeboard', plaza.col + 18.5, plaza.row + 3),
    item('decor-lantern', plaza.col + 1, bottom - 0.3), item('decor-lantern', plaza.col + plaza.cols - 1, bottom - 0.3),
    item('decor-lantern', plaza.col + 1, plaza.row + 1.6), item('decor-lantern', plaza.col + plaza.cols - 1, plaza.row + 1.6),
    // 수호나무 주변과 광장 가장자리의 꽃과 덤불
    item('decor-bush-hydrangea', anchors.guardianTree.col - 3.8, bottom - 1.5),
    item('decor-moss-rocks', anchors.guardianTree.col - 3.4, bottom - 0.6),
    item('decor-flowers-daisy', anchors.guardianTree.col - 2.1, bottom - 0.5),
    item('decor-fern', anchors.guardianTree.col - 4.5, bottom - 2.8),
    item('decor-bush-round', plaza.col + plaza.cols - 2, plaza.row + 2),
    item('decor-bush-blossom', plaza.col + plaza.cols - 1.6, plaza.row + 11),
    item('decor-flowers-tulip', anchors.bell.col + 2.3, anchors.bell.row + 0.8),
  ];
}

/** 막히면 안 되는 곳: 가로길·세로길·광장 연결 길, 광장, 마당(마당 안 장식은 yardDecor가 따로 놓아요) */
function isReserved(layout: VillageLayout, x: number, y: number, margin: number): boolean {
  const inRect = (rc: Rect, m: number) => x > rc.col - m && x < rc.col + rc.cols + m && y > rc.row - m && y < rc.row + rc.rows + m + 1;
  return (
    roadsOf(layout).some((road) => inRect(road, margin)) ||
    inRect(layout.plaza, margin) ||
    layout.yards.some((yd) => inRect(yd.rect, margin))
  );
}

/** 마을 바깥: 위쪽 숲 띠, 마당 사이, 큰길 아래 풀밭에 나무·덤불·꽃 무리 */
export function outskirtsDecor(layout: VillageLayout): DecorItem[] {
  const { bounds } = layout;
  const items: DecorItem[] = [];
  const trees = ['decor-tree-round', 'decor-tree-birch', 'decor-tree-blossom', 'decor-tree-citrus'];
  const smalls = ['decor-bush-round', 'decor-bush-blossom', 'decor-bush-hydrangea', 'decor-moss-rocks', 'decor-fern', 'decor-meadow-grass', 'decor-mushrooms', 'decor-flowers-daisy', 'decor-flowers-cosmos', 'decor-flowers-lavender'];
  const pick = <T,>(list: T[], a: number, b: number, salt: number) => list[Math.floor(noise(a, b, salt) * list.length)];

  // 위쪽 숲 띠: 맨 위 마당 줄의 울타리 바로 위에 나무를 줄지어 세워요 (윗부분은 화면 밖으로 살짝 잘려요)
  const topLine = bounds.row + 3;
  for (let x = bounds.col + 2; x < bounds.col + bounds.cols - 1; x += 3 + noise(x, 0, 1) * 2) {
    items.push(item(pick(trees, x, 0, 2), x, topLine - noise(x, 1, 3) * 0.4));
  }

  // 바깥에는 나무·관목·낮은 꽃을 같은 자리에 모아 높이가 다른 무리를 만들어요.
  for (let gy = bounds.row + 5; gy < bounds.row + bounds.rows - 1; gy += 3) {
    for (let gx = bounds.col + 1; gx < bounds.col + bounds.cols - 1; gx += 3) {
      const x = gx + noise(gx, gy, 4) * 2;
      const y = gy + noise(gx, gy, 5) * 2;
      const roll = noise(gx, gy, 6);
      if (roll < 0.45) continue;
      if (roll > 0.82 && !isReserved(layout, x, y, 3.5)) {
        items.push(item(pick(trees, gx, gy, 7), x, y));
        for (const [dx, dy, key] of [[-1.2, 0.6, pick(smalls.slice(0, 3), gx, gy, 11)], [1.2, 0.9, 'decor-flowers-daisy'], [-0.5, 1.4, 'decor-fern']] as const) {
          if (!isReserved(layout, x + dx, y + dy, 1.5)) items.push(item(key, x + dx, y + dy));
        }
      }
      else if (!isReserved(layout, x, y, 1.6)) items.push(item(pick(smalls, gx, gy, 8), x, y));
    }
  }
  return items;
}

export function villageDecor(layout: VillageLayout): DecorItem[] {
  return [...layout.yards.flatMap(yardDecor), ...plazaDecor(layout), ...outskirtsDecor(layout)];
}

/** 실제 화면과 이동 검사에서 함께 쓰는 발밑 충돌 영역 (타일 단위). */
export function worldBlocks(layout: VillageLayout, decorations = villageDecor(layout)): Rect[] {
  const foot = (x: number, y: number, w: number, h: number): Rect => ({ col: x - w / 2, row: y - h, cols: w, rows: h });
  const blocks = decorations.flatMap((d) => d.block ? [foot(d.x, d.y, d.block.w, d.block.h)] : []);
  for (const yard of layout.yards) blocks.push(foot(yard.house.col, yard.house.row + 0.9, HOUSE_TILES - 0.6, 1.6));
  const { guardianTree: tree, campfire: fire, bell } = layout.anchors;
  blocks.push(foot(tree.col + 0.5, tree.row + 1, 4, 1.5));
  blocks.push(foot(fire.col + 0.5, fire.row + 1, 4.5, 1.8));
  for (const side of [-1, 1]) blocks.push(foot(bell.col + 0.5 + side * 1.575, bell.row + 1, 0.9, 0.9));
  return blocks;
}

// ---------------------------------------------------------------- 꽃 풀밭 바닥

/**
 * 풀 타일 자리에 쓸 그림 이름. 기본 풀 4종에 꽃 풀밭을 무리 지어 섞어요.
 * - 마당 안: 그 마당 테마의 꽃 (예: 햇살 정원은 데이지·노랑꽃)
 * - 마을 바깥: 섞인 들꽃, 고사리, 버섯
 */
export function grassTileAt(layout: VillageLayout, col: number, row: number): string {
  const yard = layout.yards.find((y) => col >= y.rect.col && col < y.rect.col + y.rect.cols && row >= y.rect.row && row < y.rect.row + y.rect.rows);
  const patch = noise(Math.floor(col / 3), Math.floor(row / 3), 9); // 3×3칸 덩어리로 무리 짓기
  const roll = noise(col, row, 10);
  if (yard) {
    const meadow = THEME_STYLE[themeOf(yard)].meadow;
    if (patch > 0.62 && roll < 0.55) return meadow[roll < 0.18 ? 2 + Math.floor(roll * 10) % 2 : Math.floor(roll * 10) % 2];
  } else if (patch > 0.6 && roll < 0.5) {
    const wild = ['grass-flowers-mixed-01', 'grass-flowers-mixed-02', 'grass-fern', 'grass-fern', 'grass-mushrooms'];
    return wild[Math.floor(roll * 10) % wild.length];
  }
  return roll < 0.45 ? 'grass-01' : roll < 0.8 ? 'grass-02' : roll < 0.93 ? 'grass-03' : 'grass-04';
}
