import { describe, expect, it } from 'vitest';
import { parseCatalog, pickResident, type CatalogEntry } from './catalog';
import type { HabitId } from './habits';

const entry = (id: string, kind: CatalogEntry['kind'], extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id, name: id, kind, rare: false, unlock: null, image: `${id}.png`, ...extra,
});

const catalog: CatalogEntry[] = [
  entry('sprout-a', 'sprout'),
  entry('sprout-b', 'sprout'),
  entry('sprout-focus', 'sprout', { unlock: 'deep-focus' }),
  entry('sprout-rare', 'sprout', { rare: true }),
  entry('sleepy-rest', 'sleepy', { unlock: 'rest-and-return' }),
  entry('trouble-a', 'trouble'),
];

const none = new Set<HabitId>();
const ids = (kind: CatalogEntry['kind'], rare: boolean, unlocked: Set<HabitId>) => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(pickResident(catalog, { kind, rare }, unlocked, () => i / 100)!.id);
  return [...seen].sort();
};

describe('pickResident', () => {
  it('해금 전에는 기본 주민만 후보예요', () => {
    expect(ids('sprout', false, none)).toEqual(['sprout-a', 'sprout-b']);
  });

  it('해금하면 그 주민도 후보에 들어와요', () => {
    expect(ids('sprout', false, new Set(['deep-focus']))).toEqual(['sprout-a', 'sprout-b', 'sprout-focus']);
  });

  it('후보끼리는 똑같은 확률이에요', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const id = pickResident(catalog, { kind: 'sprout', rare: false }, new Set(['deep-focus']), () => i / 300)!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([100, 100, 100]);
  });

  it('희귀로 정해지면 희귀 후보에서만 골라요', () => {
    expect(ids('sprout', true, none)).toEqual(['sprout-rare']);
  });

  it('희귀 후보가 없으면 일반 새싹에서 골라요', () => {
    const noRare = catalog.filter((c) => !c.rare);
    expect(pickResident(noRare, { kind: 'sprout', rare: true }, none, () => 0)?.id).toBe('sprout-a');
  });

  it('후보가 하나도 없으면 null이에요 (임시 그림으로 보여줘요)', () => {
    expect(pickResident(catalog, { kind: 'sleepy', rare: false }, none)).toBeNull();
  });
});

describe('parseCatalog', () => {
  it('잘못된 줄은 빼고, 이유를 알려줘요', () => {
    const { entries, problems } = parseCatalog({
      residents: [
        { id: 'ok', name: '좋아', kind: 'sprout', image: 'ok.png' },
        { id: 'bad-kind', name: '?', kind: 'cat', image: 'x.png' },
        { id: 'bad-unlock', name: '?', kind: 'sprout', image: 'x.png', unlock: 'ten-hours' },
      ],
    });
    expect(entries.map((e) => e.id)).toEqual(['ok']);
    expect(entries[0]).toMatchObject({ rare: false, unlock: null });
    expect(problems).toHaveLength(2);
  });
});
