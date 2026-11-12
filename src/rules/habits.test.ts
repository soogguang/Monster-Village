import { describe, expect, it } from 'vitest';
import { achievedHabits, focusByTask, focusTotal, hasDeepFocus, hasManyDone, hasRestAndReturn, localDayRange, type FocusSession } from './habits';

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 9); // 11월 1일 09:00 UTC

/** start분에 시작해서 length분 동안 집중한 기록 */
const session = (start: number, length: number, taskId = 'a'): FocusSession => ({
  taskId,
  startedAt: T0 + start * MIN,
  endedAt: T0 + (start + length) * MIN,
});

describe('푹 몰입하기 (끊지 않고 50분)', () => {
  it('한 번에 50분 이상이면 달성', () => {
    expect(hasDeepFocus([session(0, 50)])).toBe(true);
  });

  it('49분이면 미달성', () => {
    expect(hasDeepFocus([session(0, 49)])).toBe(false);
  });

  it('30분 + 30분처럼 끊긴 집중은 합치지 않아요', () => {
    expect(hasDeepFocus([session(0, 30), session(31, 30)])).toBe(false);
  });
});

describe('쉬고 돌아오기 (25분 → 휴식 → 25분, 휴식은 1분 이상·앞 집중의 1/5 이하)', () => {
  it('25분 → 5분 휴식 → 25분이면 달성', () => {
    expect(hasRestAndReturn([session(0, 25), session(30, 25)])).toBe(true);
  });

  it('25분 집중 뒤 6분 쉬면 너무 오래 쉰 거예요', () => {
    expect(hasRestAndReturn([session(0, 25), session(31, 25)])).toBe(false);
  });

  it('50분 집중 뒤에는 10분까지 쉴 수 있어요', () => {
    expect(hasRestAndReturn([session(0, 50), session(60, 25)])).toBe(true);
    expect(hasRestAndReturn([session(0, 50), session(61, 25)])).toBe(false);
  });

  it('1분 미만 쉬고 다시 켜면 휴식으로 치지 않아요', () => {
    expect(hasRestAndReturn([session(0, 25), { ...session(25, 25), startedAt: T0 + 25 * MIN + 30 * 1000 }])).toBe(false);
  });

  it('앞뒤 할 일이 달라도 돼요', () => {
    expect(hasRestAndReturn([session(0, 25, '보고서'), session(30, 25, '영어')])).toBe(true);
  });

  it('뒤쪽 집중이 25분보다 짧으면 미달성', () => {
    expect(hasRestAndReturn([session(0, 25), session(30, 24)])).toBe(false);
  });

  it('기록 순서가 섞여 있어도 시간순으로 판단해요', () => {
    expect(hasRestAndReturn([session(30, 25), session(0, 25)])).toBe(true);
  });
});

describe('차곡차곡 해내기 (하루에 서로 다른 할 일 3개)', () => {
  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const done = (taskId: string, hour: number, day = 1) => ({ taskId, completedAt: Date.UTC(2026, 10, day, hour) });

  it('같은 날 3개면 달성', () => {
    expect(hasManyDone([done('a', 9), done('b', 12), done('c', 20)], dayKey)).toBe(true);
  });

  it('이틀에 나눠서 3개면 미달성', () => {
    expect(hasManyDone([done('a', 9), done('b', 12), done('c', 9, 2)], dayKey)).toBe(false);
  });
});

describe('achievedHabits', () => {
  it('달성한 습관만 모아서 알려줘요', () => {
    const result = achievedHabits([session(0, 50), session(55, 25)], []);
    expect([...result].sort()).toEqual(['deep-focus', 'rest-and-return']);
  });
});

describe('하루 집중 시간', () => {
  const M = 60 * 1000;
  const day = localDayRange(new Date(2026, 10, 8, 15).getTime()); // 11월 8일 0시 ~ 9일 0시

  it('그날 0시~다음 날 0시 안에서 할 일마다 집중한 시간을 더해요', () => {
    const sessions = [
      { taskId: 'a', startedAt: day.from + 9 * 60 * M, endedAt: day.from + 9 * 60 * M + 50 * M },
      { taskId: 'b', startedAt: day.from + 13 * 60 * M, endedAt: day.from + 13 * 60 * M + 30 * M },
      { taskId: 'a', startedAt: day.from + 20 * 60 * M, endedAt: day.from + 20 * 60 * M + 20 * M },
    ];
    expect(focusByTask(sessions, day.from, day.to).get('a')).toBe(70 * M);
    expect(focusTotal(sessions, day.from, day.to)).toBe(100 * M);
  });

  it('자정을 걸친 집중은 날마다 나눠서 세요', () => {
    const late = [{ taskId: 'a', startedAt: day.to - 60 * M, endedAt: day.to + 30 * M }];
    expect(focusTotal(late, day.from, day.to)).toBe(60 * M);
    expect(focusTotal(late, day.to, day.to + 24 * 60 * M)).toBe(30 * M);
  });

  it('지금 집중 중이면 지금까지의 시간도 더해요', () => {
    const now = day.from + 15 * 60 * M;
    expect(focusTotal([], day.from, day.to, { taskId: 'a', startedAt: now - 25 * M }, now)).toBe(25 * M);
  });
});
