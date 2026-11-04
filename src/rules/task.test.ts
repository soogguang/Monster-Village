import { describe, expect, it } from 'vitest';
import {
  addFocus,
  createTask,
  decideResident,
  doughStage,
  extendDue,
  progressRatio,
} from './task';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 1); // 11월 1일
const DUE = START + 10 * DAY; // 11월 11일

const baseTask = () => createTask({ id: 't1', title: '보고서', startAt: START, dueAt: DUE });

describe('createTask', () => {
  it('마감일이 시작일보다 앞이거나 같으면 거부해요', () => {
    expect(() => createTask({ id: 'x', title: 'x', startAt: DUE, dueAt: START })).toThrow();
    expect(() => createTask({ id: 'x', title: 'x', startAt: START, dueAt: START })).toThrow();
  });
});

describe('progressRatio', () => {
  it('기간 중 어디쯤에서 끝냈는지 비율로 계산해요', () => {
    expect(progressRatio(baseTask(), START + 2 * DAY)).toBeCloseTo(0.2);
    expect(progressRatio(baseTask(), DUE)).toBe(1);
  });

  it('시작일 전에 끝내면 0이에요', () => {
    expect(progressRatio(baseTask(), START - DAY)).toBe(0);
  });

  it('같은 날 안의 할 일도 시간 단위로 계산해요', () => {
    const t = createTask({ id: 't', title: '과제', startAt: START, dueAt: START + 10 * HOUR });
    expect(progressRatio(t, START + 3 * HOUR)).toBeCloseTo(0.3);
  });
});

describe('doughStage', () => {
  it('시작일 전에는 말랑 반죽이에요', () => {
    expect(doughStage(baseTask(), START - HOUR)).toBe('soft');
  });

  it('긴 할 일은 시작 후 최대 1시간까지 말랑 반죽이에요', () => {
    expect(doughStage(baseTask(), START + 59 * 60 * 1000)).toBe('soft');
    expect(doughStage(baseTask(), START + 61 * 60 * 1000)).toBe('grumpy');
  });

  it('짧은 할 일은 기간의 20%까지만 여유를 줘요 (1시간짜리면 12분)', () => {
    const short = createTask({ id: 's', title: '짧은 일', startAt: START, dueAt: START + HOUR });
    expect(doughStage(short, START + 11 * 60 * 1000)).toBe('soft');
    expect(doughStage(short, START + 13 * 60 * 1000)).toBe('grumpy');
  });

  it('시작일이 지나도 집중을 안 했으면 심술 반죽이에요', () => {
    expect(doughStage(baseTask(), START + DAY)).toBe('grumpy');
  });

  it('한 번이라도 집중했으면 마감 전까지 말랑 반죽이에요', () => {
    expect(doughStage(addFocus(baseTask(), 10), START + DAY)).toBe('soft');
  });

  it('마감일이 지나면 집중 여부와 상관없이 찐 몬스터예요', () => {
    expect(doughStage(addFocus(baseTask(), 60), DUE + HOUR)).toBe('monster');
  });
});

describe('decideResident', () => {
  const always = (v: number) => () => v;

  it('30% 이하에 끝내면 새싹이고 희귀 확률이 높아요', () => {
    const at = START + 3 * DAY;
    expect(decideResident(baseTask(), at, always(0.3))).toEqual({ kind: 'sprout', rare: true });
    expect(decideResident(baseTask(), at, always(0.5))).toEqual({ kind: 'sprout', rare: false });
  });

  it('30~80% 사이에 끝내면 새싹이고 희귀 확률은 낮아요', () => {
    const at = START + 5 * DAY;
    expect(decideResident(baseTask(), at, always(0.3))).toEqual({ kind: 'sprout', rare: false });
    expect(decideResident(baseTask(), at, always(0.01))).toEqual({ kind: 'sprout', rare: true });
  });

  it('80% 이상에 끝내면 집중 시간에 따라 꾸벅이 또는 말썽이에요', () => {
    const at = START + 9 * DAY;
    expect(decideResident(addFocus(baseTask(), 25), at).kind).toBe('sleepy');
    expect(decideResident(addFocus(baseTask(), 10), at).kind).toBe('trouble');
  });

  it('마감 후에 끝내도 같은 규칙이고 희귀는 나오지 않아요', () => {
    const at = DUE + 2 * DAY;
    expect(decideResident(addFocus(baseTask(), 30), at, always(0))).toEqual({
      kind: 'sleepy',
      rare: false,
    });
    expect(decideResident(baseTask(), at, always(0))).toEqual({ kind: 'trouble', rare: false });
  });
});

describe('extendDue', () => {
  it('마감을 미루면 횟수가 기록돼요', () => {
    const t = extendDue(baseTask(), DUE + DAY);
    expect(t.dueAt).toBe(DUE + DAY);
    expect(t.dueExtensions).toBe(1);
  });

  it('마감을 앞당기는 건 연장이 아니라서 거부해요', () => {
    expect(() => extendDue(baseTask(), DUE - DAY)).toThrow();
  });
});
