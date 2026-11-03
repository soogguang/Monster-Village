import { describe, expect, it } from 'vitest';
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
    const r = store.completeTask(t.id);
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
    expect(store.completeTask(t.id).kind).toBe('sleepy');
  });

  it('이미 끝낸 할 일은 다시 끝낼 수 없어요', () => {
    const { store, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    store.completeTask(t.id);
    expect(() => store.completeTask(t.id)).toThrow();
  });
});
