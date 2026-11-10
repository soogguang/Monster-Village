import { describe, expect, it } from 'vitest';
import {
  addFocus,
  createTask,
  decideResident,
  doughStage,
  extendDue,
  isStuckGrumpy,
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

  // 10일짜리 일: 50% = 5일째(심술 시작), 75% = 7.5일째(심술이 굳어요)
  const focusAt = (day: number) => addFocus(baseTask(), 10, START + day * DAY);

  it('기간의 50%까지는 집중 안 해도 말랑 반죽이에요', () => {
    expect(doughStage(baseTask(), START + 5 * DAY - HOUR)).toBe('soft');
    expect(doughStage(baseTask(), START + 5 * DAY + HOUR)).toBe('grumpy');
  });

  it('짧은 할 일도 같은 비율이에요 (1시간짜리면 30분부터 심술)', () => {
    const short = createTask({ id: 's', title: '짧은 일', startAt: START, dueAt: START + HOUR });
    expect(doughStage(short, START + 29 * 60 * 1000)).toBe('soft');
    expect(doughStage(short, START + 31 * 60 * 1000)).toBe('grumpy');
  });

  it('50% 전에 한 번이라도 집중했으면 마감 전까지 계속 말랑이에요', () => {
    expect(doughStage(focusAt(1), START + 9 * DAY)).toBe('soft');
  });

  it('심술이었다가 75% 전에 집중하면 다시 말랑이 돼요', () => {
    expect(doughStage(baseTask(), START + 6 * DAY)).toBe('grumpy');
    expect(doughStage(focusAt(6), START + 6 * DAY + HOUR)).toBe('soft');
    expect(isStuckGrumpy(focusAt(6), START + 9 * DAY)).toBe(false);
  });

  it('75%까지 한 번도 집중 안 하면 굳은 심술: 그 뒤에 집중해도 풀리지 않아요', () => {
    expect(isStuckGrumpy(baseTask(), START + 7 * DAY)).toBe(false); // 아직 75% 전
    expect(isStuckGrumpy(baseTask(), START + 8 * DAY)).toBe(true);
    const late = focusAt(8);
    expect(doughStage(late, START + 8 * DAY + HOUR)).toBe('grumpy');
    expect(isStuckGrumpy(late, START + 8 * DAY + HOUR)).toBe(true);
  });

  it('마감일이 지나면 집중 여부와 상관없이 몬스터 반죽이에요', () => {
    expect(doughStage(focusAt(1), DUE + HOUR)).toBe('monster');
  });
});

describe('decideResident', () => {
  const always = (v: number) => () => v;
  const focusAt = (day: number) => addFocus(baseTask(), 10, START + day * DAY);

  it('30% 이하에 끝내면 새싹이고 희귀 확률이 높아요', () => {
    const at = START + 3 * DAY;
    expect(decideResident(focusAt(1), at, always(0.3))).toEqual({ kind: 'sprout', rare: true });
    expect(decideResident(focusAt(1), at, always(0.5))).toEqual({ kind: 'sprout', rare: false });
  });

  it('30~75% 사이에 끝내면 새싹이고 희귀 확률은 낮아요', () => {
    const at = START + 5 * DAY;
    expect(decideResident(focusAt(1), at, always(0.3))).toEqual({ kind: 'sprout', rare: false });
    expect(decideResident(focusAt(1), at, always(0.01))).toEqual({ kind: 'sprout', rare: true });
  });

  it('새싹은 그 할 일에 10분 이상 집중했을 때만 태어나요 (부족하면 null: 주민으로 자라지 못함)', () => {
    const at = START + 3 * DAY;
    expect(decideResident(baseTask(), at)).toBeNull();
    expect(decideResident(addFocus(baseTask(), 9, START + DAY), at)).toBeNull();
    expect(decideResident(addFocus(baseTask(), 10, START + DAY), at)?.kind).toBe('sprout');
    // 늦게 끝냈지만 처음부터 말랑(새싹 차례)이어도 같은 조건
    expect(decideResident(addFocus(baseTask(), 5, START + DAY), START + 9 * DAY)).toBeNull();
  });

  it('꾸벅이·말썽은 10분 조건 없이 태어나요', () => {
    expect(decideResident(addFocus(baseTask(), 2, START + 6 * DAY), START + 9 * DAY)?.kind).toBe('sleepy');
    expect(decideResident(baseTask(), START + 9 * DAY)?.kind).toBe('trouble');
    expect(decideResident(baseTask(), DUE + DAY)?.kind).toBe('trouble');
  });

  it('75% 이후에 끝내면 반죽이 지나온 길에 따라: 처음부터 말랑 → 새싹, 심술에서 풀림 → 꾸벅이, 굳은 심술 → 말썽', () => {
    const at = START + 9 * DAY;
    expect(decideResident(focusAt(2), at, always(0))).toEqual({ kind: 'sprout', rare: false }); // 희귀는 일찍 끝냈을 때만
    expect(decideResident(focusAt(6), at)?.kind).toBe('sleepy');
    expect(decideResident(baseTask(), at)?.kind).toBe('trouble');
    expect(decideResident(focusAt(8), at)?.kind).toBe('trouble'); // 굳은 뒤에 집중
  });

  it('마감 후(몬스터 반죽)에 끝내면 집중했어도 말썽이에요', () => {
    const at = DUE + 2 * DAY;
    expect(decideResident(focusAt(1), at, always(0))).toEqual({ kind: 'trouble', rare: false });
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
