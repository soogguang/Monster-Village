import { describe, expect, it } from 'vitest';
import { cleanNickname } from './format';

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
