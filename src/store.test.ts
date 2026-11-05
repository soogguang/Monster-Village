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

  it('할 일을 고칠 때 마감을 뒤로 미루면 연장으로 기록돼요', () => {
    const { store, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    store.updateTask(t.id, { title: '보고서 초안', startAt: start, dueAt: start + 2 * DAY });
    expect(store.get().tasks[0]).toMatchObject({ title: '보고서 초안', dueExtensions: 1 });
    store.updateTask(t.id, { title: '보고서 초안', startAt: start, dueAt: start + DAY });
    expect(store.get().tasks[0].dueExtensions).toBe(1);
  });

  it('할 일을 고칠 때 마감이 시작보다 앞이면 거부해요', () => {
    const { store, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    expect(() => store.updateTask(t.id, { title: '보고서', startAt: start + DAY, dueAt: start })).toThrow();
  });

  it('주민에게 별명을 붙일 수 있어요', () => {
    const { store, start } = setup();
    const t = store.addTask('보고서', start, start + DAY);
    const { resident } = store.completeTask(t.id);
    store.renameResident(resident.id, '  콩이 ');
    expect(store.get().residents[0].nickname).toBe('콩이');
  });

  it('새 할 일은 기본으로 달력에 마감일만 표시돼요', () => {
    const { store, start } = setup();
    expect(store.addTask('a', start, start + DAY).calendarStyle).toBe('due');
    expect(store.addTask('b', start, start + DAY, 'range').calendarStyle).toBe('range');
  });

  it('오늘 할 수 있는 일 중에서 골라서 오늘 할 일로 가져와요', () => {
    const { store, start } = setup();
    const inRange = store.addTask('기간 중', start - DAY, start + 3 * DAY);
    const overdue = store.addTask('마감 지남', start - 3 * DAY, start - DAY);
    store.addTask('아직 시작 전', start + 3 * DAY, start + 5 * DAY);
    expect(store.todayCandidates().map((t) => t.title)).toEqual(['마감 지남', '기간 중']);
    store.addToToday([inRange.id]);
    expect(store.todayPlan().map((t) => t.id)).toEqual([inRange.id]);
    expect(store.todayCandidates().map((t) => t.id)).toEqual([overdue.id]);
    store.removeFromToday(inRange.id);
    expect(store.todayPlan()).toEqual([]);
  });

  it('오늘만 할 일은 만들자마자 오늘 할 일에 들어가요', () => {
    const { store } = setup();
    const t = store.addTodayOnlyTask('우체국 가기');
    expect(store.todayPlan().map((x) => x.id)).toEqual([t.id]);
  });

  it('하루가 지나면 오늘 할 일은 새로 시작해요', () => {
    const { store, start, advance } = setup();
    const t = store.addTask('a', start, start + 5 * DAY);
    store.addToToday([t.id]);
    advance(DAY);
    expect(store.todayPlan()).toEqual([]);
    expect(store.todayCandidates().map((x) => x.id)).toEqual([t.id]);
  });

  it('연결이 5분 넘게 끊기면 집중을 마지막 신호 시각에 끝내요', () => {
    const { store, start, advance } = setup();
    const t = store.addTask('a', start, start + DAY);
    store.startFocus(t.id);
    // 창이 열려 있는 동안은 신호가 계속 와요 (탭이 뒤로 가 있으면 1분 간격까지 느려질 수 있어요)
    for (let i = 0; i < 20; i++) {
      advance(MINUTE);
      expect(store.heartbeat()).toBeNull();
    }
    advance(4 * MINUTE); // 5분 이내의 짧은 끊김은 괜찮아요
    expect(store.heartbeat()).toBeNull();
    const lastSeen = store.get().lastSeenAt!;
    advance(30 * MINUTE); // 노트북을 덮었다가 30분 뒤에 열었어요
    const ended = store.heartbeat();
    expect(ended?.endedAt).toBe(lastSeen);
    expect(store.get().focus).toBeNull();
    expect(store.get().sessions.at(-1)).toMatchObject({ startedAt: start, endedAt: lastSeen });
  });

  it('같은 캐릭터가 또 나오면 새 주민 대신 친밀도가 올라가고, 3·6에서 단계가 올라가요', () => {
    const { store, start } = setup(0.99);
    store.setCatalog([{ id: 'puppy', name: '강아지', kind: 'sprout', rare: false, unlock: null, image: 'p.png' }]);
    const results = Array.from({ length: 6 }, (_, i) => store.completeTask(store.addTask(`t${i}`, start, start + 10 * DAY).id));
    expect(store.get().residents).toHaveLength(1);
    expect(store.get().residents[0].hearts).toBe(6);
    expect(results.map((r) => r.isNew)).toEqual([true, false, false, false, false, false]);
    expect(results.map((r) => r.stageUp)).toEqual([null, null, 'friend', null, null, 'evolved']);
  });

  it('주민을 마당에서 숨기거나 다시 나오게 할 수 있어요', () => {
    const { store, start } = setup();
    const { resident } = store.completeTask(store.addTask('a', start, start + DAY).id);
    expect(resident.visible).toBe(true);
    store.setResidentVisible(resident.id, false);
    expect(store.get().residents[0].visible).toBe(false);
  });

  it('예전 데이터에 같은 캐릭터가 여러 명이면 한 명으로 합치고 ♥를 더해요', () => {
    const storage = new MemoryStorage();
    const r = (id: string, bornAt: number) => ({ id, kind: 'sprout', rare: false, speciesId: 'cat', fromTask: 't', bornAt });
    storage.saved = { residents: [r('b', 2), r('a', 1), { ...r('c', 3), speciesId: 'dog' }] } as unknown as GameState;
    const store = new GameStore(storage);
    expect(store.get().residents.map((x) => [x.id, x.hearts])).toEqual([['a', 2], ['c', 1]]);
  });
});
