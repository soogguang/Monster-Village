import { describe, expect, it } from 'vitest';
import { createTask, type Task } from '../rules/task';
import { CALENDAR_ROWS, DAY_MS, colorOf, layoutWeek } from './calendarLayout';

// 2026년 11월 1일(일) 0시부터 한 주
const SUN = new Date(2026, 10, 1).getTime();
const week = (offsetWeeks = 0) => Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 1 + offsetWeeks * 7 + i).getTime());
const at = (day: number, hour = 9) => new Date(2026, 10, 1 + day, hour).getTime();
let n = 0;
const range = (title: string, from: number, to: number, extra: Partial<Task> = {}): Task =>
  ({ ...createTask({ id: `t${n++}`, title, startAt: at(from), dueAt: at(to, 23), calendarStyle: 'range' }), ...extra });
const due = (title: string, day: number, hour = 21): Task =>
  createTask({ id: `t${n++}`, title, startAt: at(day, 0) - DAY_MS, dueAt: at(day, hour), calendarStyle: 'due' });

describe('달력 한 주 배치', () => {
  it('기간 할 일은 이 주 안에서 시작 칸부터 끝 칸까지 막대 하나예요', () => {
    const { bars } = layoutWeek([range('집', 1, 4)], week());
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ startCol: 1, endCol: 4, lane: 0, fromBefore: false, toAfter: false, dueInWeek: true });
  });

  it('막대마다 줄을 하나 정해서, 겹치는 기간 동안 같은 높이를 지켜요', () => {
    const a = range('긴 일', 0, 6);
    const b = range('짧은 일', 2, 3);
    const c = range('뒤에 시작', 4, 5);
    const { bars } = layoutWeek([b, c, a], week());
    const lane = (t: Task) => bars.find((x) => x.task.id === t.id)!.lane;
    expect(lane(a)).toBe(0); // 먼저 시작하고 긴 막대가 맨 위
    expect(lane(b)).toBe(1);
    expect(lane(c)).toBe(1); // b가 끝난 뒤라 같은 줄을 다시 써요
  });

  it('주를 넘어가는 막대는 다음 주에서 이어지고, 마감 📌는 마감이 있는 주에만 붙어요', () => {
    const t = range('여행', 5, 9);
    const first = layoutWeek([t], week(0)).bars[0];
    const second = layoutWeek([t], week(1)).bars[0];
    expect(first).toMatchObject({ startCol: 5, endCol: 6, toAfter: true, dueInWeek: false });
    expect(second).toMatchObject({ startCol: 0, endCol: 2, fromBefore: true, dueInWeek: true });
  });

  it('마감일만 할 일은 막대가 지나가는 줄을 피해서, 마감 시각 순서로 놓여요', () => {
    const late = due('저녁 회의', 3, 21);
    const early = due('아침 수업', 3, 9);
    const { cells } = layoutWeek([range('집', 2, 4), late, early], week());
    expect(cells[3].rows.map((r) => r?.title ?? '막대')).toEqual(['막대', '아침 수업', '저녁 회의']);
    expect(cells[0].rows).toEqual([]);
  });

  it('위쪽 줄이 비어 있으면 그 줄부터 채워요 (아래 막대 자리는 지켜요)', () => {
    const top = range('위 막대', 0, 1); // 0줄, 일·월만
    const low = range('아래 막대', 1, 3); // 1줄, 월~수
    const d = due('수요일 일', 3, 9);
    const { cells } = layoutWeek([top, low, d], week());
    expect(cells[3].rows.map((r) => r?.title ?? '막대')).toEqual(['수요일 일', '막대']);
  });

  it(`한 칸에 ${CALENDAR_ROWS}줄이 넘으면 +N개로 줄여요`, () => {
    const tasks = [range('a', 0, 2), range('b', 0, 2), due('c', 1), due('d', 1), due('e', 1)];
    const { cells, bars } = layoutWeek(tasks, week());
    expect(bars).toHaveLength(2);
    expect(cells[1].items).toHaveLength(1);
    expect(cells[1].hidden).toBe(2);
  });

  it('줄이 넘치는 막대는 그리지 않고 +N개에 세요', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((t) => range(t, 0, 1));
    const { bars, cells } = layoutWeek(tasks, week());
    expect(bars).toHaveLength(CALENDAR_ROWS);
    expect(cells[0].hidden).toBe(1);
  });

  it('일찍 끝낸 기간 할 일은 끝낸 날까지만 막대가 이어져요', () => {
    const t = range('보고서', 0, 6, { completedAt: at(2, 15) });
    expect(layoutWeek([t], week()).bars[0]).toMatchObject({ endCol: 2, dueInWeek: false });
  });

  it('색을 고르지 않은 예전 할 일은 하늘색이에요', () => {
    expect(colorOf({})).toBe('sky');
    expect(colorOf({ color: 'pink' })).toBe('pink');
    expect(SUN).toBe(week()[0]);
  });
});
