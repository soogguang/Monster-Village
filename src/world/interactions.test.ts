import { describe, expect, it } from 'vitest';
import { canInteract, landmarkTargets, nearbyLandmark } from './interactions';
import { createVillageLayout } from './layout';

describe('광장 사물 사용', () => {
  const layout = createVillageLayout(['me']);
  const targets = landmarkTargets(layout);

  it('큰 그림에 가려지지 않게 발밑에서 다가가면 각 사물을 사용할 수 있어요', () => {
    for (const target of targets) {
      const player = { col: target.col, row: target.row + 0.6 };
      expect(nearbyLandmark(player, targets)?.id).toBe(target.id);
    }
  });

  it('그림의 커다란 나뭇잎을 멀리서 눌러도 사용할 수는 없어요', () => {
    const tree = targets.find((t) => t.id === 'tree')!;
    expect(canInteract({ col: tree.col, row: tree.row - 10 }, tree)).toBe(false);
  });

  it('범위 끝은 포함하지만, 대각선으로 멀어지면 제외해요', () => {
    const target = targets[0];
    expect(canInteract({ col: target.col + 3, row: target.row }, target)).toBe(true);
    expect(canInteract({ col: target.col + 2.5, row: target.row + 2.5 }, target)).toBe(false);
  });

  it('여러 후보가 가까우면 가장 가까운 사물 하나를 골라요', () => {
    const choices = [{ id: 'tree' as const, col: 0, row: 0 }, { id: 'bell' as const, col: 2, row: 0 }];
    expect(nearbyLandmark({ col: 1.8, row: 0 }, choices)?.id).toBe('bell');
  });

  it('마당이나 먼 곳에서는 안내할 사물이 없어요', () => {
    const house = layout.yards[0].house;
    expect(nearbyLandmark(house, targets)).toBeNull();
    expect(nearbyLandmark({ col: 0, row: 0 }, [])).toBeNull();
  });

  it('광장 배치를 바꾸면 클릭과 키보드 사용 위치도 함께 따라가요', () => {
    const oldTree = targets[0];
    const moved = { ...layout, anchors: { ...layout.anchors, guardianTree: { col: oldTree.col + 12, row: oldTree.row + 12 } } };
    const current = landmarkTargets(moved);
    expect(nearbyLandmark(oldTree, current)).toBeNull();
    expect(nearbyLandmark({ col: current[0].col, row: current[0].row + 1 }, current)?.id).toBe('tree');
  });
});
