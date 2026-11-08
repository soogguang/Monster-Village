import { describe, expect, it } from 'vitest';
import { DAY, cleanNickname, defaultStartForDay, todayAt, toTimeInput } from './format';

describe('동네 이름', () => {
  it('앞뒤 공백을 빼고, 가운데 여러 칸은 한 칸으로 줄여요', () => {
    expect(cleanNickname('  수인  ')).toBe('수인');
    expect(cleanNickname('미룬   일')).toBe('미룬 일');
  });

  it('1~12자만 돼요 (한글·이모지도 한 글자씩)', () => {
    expect(cleanNickname('')).toBeNull();
    expect(cleanNickname('   ')).toBeNull();
    expect(cleanNickname('가'.repeat(12))).toBe('가'.repeat(12));
    expect(cleanNickname('가'.repeat(13))).toBeNull();
    expect(cleanNickname('🐶'.repeat(12))).toBe('🐶'.repeat(12));
  });

  it('다른 사람과 같은 이름도 괜찮아요 (따로 막지 않아요)', () => {
    expect(cleanNickname('주민')).toBe('주민');
  });
});

describe('달력·오늘만 할 일의 시작 시각', () => {
  const day = new Date(2026, 10, 8).getTime(); // 11월 8일 0시
  const now = day + 17 * 60 * 60 * 1000; // 오후 5시

  it('오늘 날짜를 누르면 시작은 0시가 아니라 지금이에요', () => {
    expect(defaultStartForDay(day, now)).toBe(now);
  });

  it('앞으로의 날도 시작은 지금, 지난 날은 그날 0시예요', () => {
    expect(defaultStartForDay(day + 3 * DAY, now)).toBe(now);
    expect(defaultStartForDay(day - 2 * DAY, now)).toBe(day - 2 * DAY);
  });

  it('시작 칸(시:분)을 오늘 시각으로 바꿔요', () => {
    expect(todayAt('09:30', now)).toBe(day + 9.5 * 60 * 60 * 1000);
    expect(toTimeInput(now)).toBe('17:00');
  });
});
