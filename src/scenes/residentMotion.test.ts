import { describe, expect, it } from 'vitest';
import { FLOWER_GIFTERS, residentActionImages, residentActionPose, residentWalkPose, seasonFlower } from './residentMotion';

describe('주민 걷기', () => {
  it('이동하는 동안 픽셀 격자를 지키고 발밑 깊이는 점프와 분리해요', () => {
    const from = { x: 100, y: 100 }, to = { x: 200, y: 150 };
    const heights = new Set<number>();
    for (let elapsed = 0; elapsed <= 1000; elapsed += 17) {
      const pose = residentWalkPose(from, to, elapsed, 1000);
      expect([pose.x, pose.y, pose.groundY].every(Number.isInteger)).toBe(true);
      expect(pose.groundY - pose.y).toBeGreaterThanOrEqual(0);
      expect(pose.groundY - pose.y).toBeLessThanOrEqual(2);
      heights.add(pose.groundY - pose.y);
    }
    expect(heights.size).toBeGreaterThan(1);
  });

  it('양 끝과 늦은 프레임에서 정확히 바닥에 내려와요', () => {
    const a = { x: 20, y: 70 }, b = { x: 0, y: 10 };
    expect(residentWalkPose(a, b, -100, 1000)).toEqual({ ...a, groundY: 70, done: false });
    expect(residentWalkPose(a, b, 1500, 1000)).toEqual({ ...b, groundY: 10, done: true });
    expect(residentWalkPose(a, b, 0, 0)).toEqual({ ...b, groundY: 10, done: true });
  });
});

describe('주민 성격 동작', () => {
  it('토끼는 정면 → 점프 → 정면으로 폴짝 뛴 뒤 앉고, 끝나면 기본 모습으로 돌아갈 수 있어요', () => {
    expect(residentActionPose('sprout-rabbit', 0)).toEqual({ image: 'sprout-rabbit', lift: 0 });
    expect(residentActionPose('sprout-rabbit', 180)).toEqual({ image: 'sprout-rabbit-jump', lift: 8 });
    expect(residentActionPose('sprout-rabbit', 480)).toEqual({ image: 'sprout-rabbit', lift: 0 });
    expect(residentActionPose('sprout-rabbit', 1260)).toEqual({ image: 'sprout-rabbit-sit', lift: 0 });
    expect(residentActionPose('sprout-rabbit', 3060)).toBeNull();
  });

  it('꾸벅이 풀잎곰은 앉았다가 낙엽 이불을 덮고 오래(30초) 잠들어요', () => {
    expect(residentActionPose('sleepy-leaf-bear', 0)?.image).toBe('sleepy-leaf-bear-sit');
    expect(residentActionPose('sleepy-leaf-bear', 1200)?.image).toBe('sleepy-leaf-bear-leaf-blanket');
    expect(residentActionPose('sleepy-leaf-bear', 31199)?.image).toBe('sleepy-leaf-bear-leaf-blanket');
    expect(residentActionPose('sleepy-leaf-bear', 31200)?.image).toBe('sleepy-leaf-bear-sit');
    expect(residentActionPose('sleepy-leaf-bear', 32400)).toBeNull();
    expect(residentActionImages('sleepy-leaf-bear')).toEqual(['sleepy-leaf-bear-sit', 'sleepy-leaf-bear-leaf-blanket']);
  });

  it('별마녀냥은 마법봉을 내밀고(꽃이 피어나요) 앉아서 쉬어요', () => {
    expect(residentActionPose('sprout-witch-cat', 0)?.image).toBe('sprout-witch-cat-cast');
    expect(FLOWER_GIFTERS['sprout-witch-cat'].bloomAt).toBeLessThan(1400);
    expect(residentActionPose('sprout-witch-cat', 1400)?.image).toBe('sprout-witch-cat-sit');
    expect(residentActionPose('sprout-witch-cat', 3600)).toBeNull();
  });

  it('계절 꽃: 봄 튤립, 여름 수국, 가을 해바라기, 겨울 동백', () => {
    const flower = (month: number) => seasonFlower(new Date(2026, month - 1, 15));
    expect([3, 4, 5].map(flower)).toEqual(Array(3).fill('flower-tulip'));
    expect([6, 7, 8].map(flower)).toEqual(Array(3).fill('flower-hydrangea'));
    expect([9, 10, 11].map(flower)).toEqual(Array(3).fill('flower-sunflower'));
    expect([12, 1, 2].map(flower)).toEqual(Array(3).fill('flower-camellia'));
  });

  it('만두는 먹은 뒤 볼을 채우고, 새 주민의 행동이 없으면 그대로 쉬어요', () => {
    expect(residentActionPose('sprout-mandu', 0)?.image).toBe('sprout-mandu-eat');
    expect(residentActionPose('sprout-mandu', 650)?.image).toBe('sprout-mandu-full');
    expect(residentActionPose('future-resident', 0)).toBeNull();
    expect(residentActionPose(null, 0)).toBeNull();
    expect(residentActionImages('future-resident')).toEqual([]);
  });
});
