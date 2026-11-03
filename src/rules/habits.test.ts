import { describe, expect, it } from 'vitest';
import { achievedHabits, hasDeepFocus, hasManyDone, hasRestAndReturn, type FocusSession } from './habits';

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
