import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from './rules/catalog';
import { GameStore, type GameState, type Storage } from './store';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

class MemoryStorage implements Storage {
  saved: GameState | null = null;
  load() {
    return this.saved;
  }
  save(s: GameState) {
    this.saved = s;
  }
}

function setup(rng = 0.99) {
  let now = Date.UTC(2026, 10, 1);
  const storage = new MemoryStorage();
  const store = new GameStore(storage, () => now, () => rng);
  return { store, storage, advance: (ms: number) => (now += ms), start: now };
}

describe('GameStore', () => {
  it('할 일을 등록하면 저장돼요', () => {
    const { store, storage, start } = setup();
    store.addTask('  보고서 ', start, start + 10 * DAY);
    expect(storage.saved?.tasks).toHaveLength(1);
    expect(storage.saved?.tasks[0].title).toBe('보고서');
  });

  it('집중을 끝내면 집중한 시간(분)이 쌓여요', () => {
    const { store, advance, start } = setup();
    const t = store.addTask('보고서', start, start + 10 * DAY);
    store.startFocus(t.id);
    advance(25 * MINUTE + 30 * 1000);
    store.stopFocus();
    expect(store.get().tasks[0].focusMinutes).toBe(25);
    expect(store.get().focus).toBeNull();
  });

  it('일찍 끝내면 새싹 주민이 태어나요', () => {
    const { store, advance, start } = setup();
    const t = store.addTask('보고서', start, start + 10 * DAY);
    advance(2 * DAY);
    const r = store.completeTask(t.id).resident;
    expect(r.kind).toBe('sprout');
    expect(store.get().residents).toHaveLength(1);
    expect(store.get().tasks[0].completedAt).toBeDefined();
  });

  it('늦게 끝내도 집중 중이던 시간까지 계산해서 꾸벅이가 될 수 있어요', () => {
    const { store, advance, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    advance(DAY);
    store.startFocus(t.id);
    advance(30 * MINUTE);
    expect(store.completeTask(t.id).resident.kind).toBe('sleepy');
  });

  it('이미 끝낸 할 일은 다시 끝낼 수 없어요', () => {
    const { store, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    store.completeTask(t.id);
    expect(() => store.completeTask(t.id)).toThrow();
  });

  it('집중할 때마다 기록이 남아요', () => {
    const { store, advance, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    store.startFocus(t.id);
    advance(10 * MINUTE);
    store.stopFocus();
    expect(store.get().sessions).toEqual([{ taskId: t.id, startedAt: start, endedAt: start + 10 * MINUTE }]);
  });

  it('50분 집중하면 푹 몰입하기가 해금되고, 한 번만 알려줘요', () => {
    const { store, advance, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    store.startFocus(t.id);
    advance(50 * MINUTE);
    expect(store.stopFocus()).toEqual(['deep-focus']);
    store.startFocus(t.id);
    advance(50 * MINUTE);
    expect(store.stopFocus()).toEqual([]);
    expect(store.get().unlocks['deep-focus']).toBeDefined();
  });

  it('하루에 3개를 끝내면 차곡차곡 해내기가 해금되고, 그 주민이 바로 후보에 들어와요', () => {
    const { store, start } = setup(0);
    const onlyUnlocked: CatalogEntry[] = [
      { id: 'busy-bee', name: '부지런', kind: 'sprout', rare: false, unlock: 'many-done', image: 'busy-bee.png' },
    ];
    store.setCatalog(onlyUnlocked);
    const [a, b, c] = ['a', 'b', 'c'].map((x) => store.addTask(x, start, start + 10 * DAY));
    expect(store.completeTask(a.id).species).toBeNull();
    store.completeTask(b.id);
    const third = store.completeTask(c.id);
    expect(third.newUnlocks).toEqual(['many-done']);
    expect(third.species?.id).toBe('busy-bee');
    expect(third.resident.speciesId).toBe('busy-bee');
  });

  it('희귀로 뽑혔지만 희귀 후보가 없어서 일반 주민이 나오면 일반으로 기록해요', () => {
    const { store, start } = setup(0); // 난수 0 → 희귀 판정
    store.setCatalog([{ id: 'plain', name: '보통', kind: 'sprout', rare: false, unlock: null, image: 'plain.png' }]);
    const t = store.addTask('a', start, start + 10 * DAY);
    const { resident } = store.completeTask(t.id);
    expect(resident).toMatchObject({ speciesId: 'plain', rare: false });
  });

  it('예전 형식으로 저장된 데이터도 불러와요', () => {
    const storage = new MemoryStorage();
    storage.saved = { tasks: [], residents: [], focus: null } as unknown as GameState;
    const store = new GameStore(storage);
    expect(store.get().sessions).toEqual([]);
    expect(store.get().unlocks).toEqual({});
  });
});
