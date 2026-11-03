// 실제 그림이 오기 전까지 쓰는 임시 그림들이에요.
// 명암과 외곽선을 조금 넣어서 최종 느낌에 가깝게 그렸어요. 실제 그림이 생기면 같은 이름으로 불러오면 돼요.

import Phaser from 'phaser';
import { TILE_SIZE } from '../config';

const OUTLINE = 0x3a2b2b;
/** 임시 그림은 16픽셀 기준으로 그려 두고, 실제 타일 크기에 맞춰 K배로 키워요. */
const T = 16;
const K = TILE_SIZE / T;

export function makePlaceholderTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({}, false);
  const rng = new Phaser.Math.RandomDataGenerator(['tiles']);
  const px = (x: number, y: number, color: number, w = 1, h = 1) => g.fillStyle(color).fillRect(x * K, y * K, w * K, h * K);
  const save = (key: string, w: number, h: number) => {
    g.generateTexture(key, w * K, h * K);
    g.clear();
  };

  // 풀 (4가지, 마지막은 꽃)
  for (let v = 0; v < 4; v++) {
    px(0, 0, 0x78c25a, T, T);
    for (let i = 0; i < 6; i++) {
      const x = rng.between(1, T - 2);
      const y = rng.between(2, T - 1);
      px(x, y, 0x5fa548);
      px(x, y - 1, 0x5fa548);
      px(x + 1, y, 0x9ad66f);
    }
    if (v === 3) {
      const fx = rng.between(3, 11), fy = rng.between(3, 11);
      const petal = rng.pick([0xffffff, 0xf7a8c8, 0xf6e27a]);
      px(fx, fy - 1, petal); px(fx - 1, fy, petal); px(fx + 1, fy, petal); px(fx, fy + 1, petal); px(fx, fy, 0xf2c84b);
    }
    save(`grass-${v}`, T, T);
  }

  px(0, 0, 0xc9995f, T, T);
  for (let i = 0; i < 8; i++) px(rng.between(0, 15), rng.between(0, 15), rng.pick([0xb3854f, 0xd9ad74]));
  save('dirt', T, T);

  px(0, 0, 0xb7b2a8, T, T);
  px(0, 0, 0x8f8a82, T, 1); px(0, 0, 0x8f8a82, 1, T); px(8, 0, 0x8f8a82, 1, 8); px(0, 8, 0x8f8a82, T, 1); px(4, 8, 0x8f8a82, 1, 8);
  px(2, 2, 0xcfcac0, 3, 1); px(10, 10, 0xcfcac0, 3, 1);
  save('stone', T, T);

  // 울타리 (가로, 세로)
  px(0, 0, 0x78c25a, T, T);
  px(2, 3, OUTLINE, 4, 12); px(10, 3, OUTLINE, 4, 12);
  px(3, 4, 0xa0703f, 2, 10); px(11, 4, 0xa0703f, 2, 10);
  px(0, 6, OUTLINE, 16, 3); px(0, 7, 0xb98249, 16, 1);
  px(0, 11, OUTLINE, 16, 3); px(0, 12, 0xb98249, 16, 1);
  save('fence-h', T, T);
  px(0, 0, 0x78c25a, T, T);
  px(5, 0, OUTLINE, 6, 16); px(6, 0, 0xa0703f, 4, 16); px(6, 0, 0xb98249, 1, 16);
  save('fence-v', T, T);

  // 반죽 (말랑, 심술, 몬스터)
  const blob = (key: string, fill: number, shade: number, face: 'happy' | 'grumpy', extra?: () => void) => {
    px(3, 0, OUTLINE, 10, 1); px(1, 1, OUTLINE, 2, 2); px(13, 1, OUTLINE, 2, 2);
    px(0, 3, OUTLINE, 1, 8); px(15, 3, OUTLINE, 1, 8); px(1, 11, OUTLINE, 14, 1); px(2, 12, OUTLINE, 12, 1);
    px(3, 1, fill, 10, 2); px(1, 3, fill, 14, 8); px(2, 11, shade, 12, 1); px(1, 8, shade, 14, 3);
    px(4, 2, 0xffffff, 2, 1);
    px(5, 5, OUTLINE, 1, 2); px(10, 5, OUTLINE, 1, 2);
    if (face === 'grumpy') { px(4, 4, OUTLINE, 2, 1); px(10, 4, OUTLINE, 2, 1); px(7, 8, OUTLINE, 2, 1); }
    else { px(4, 7, 0xf4a0a0); px(11, 7, 0xf4a0a0); px(7, 8, OUTLINE, 2, 1); }
    extra?.();
    save(key, 16, 13);
  };
  blob('dough-soft', 0xfaf0d7, 0xe8d7b4, 'happy');
  blob('dough-grumpy', 0xf2b469, 0xd99550, 'grumpy');
  blob('dough-monster', 0x9a6fd0, 0x7a52b0, 'grumpy');

  // 임시 주민 (새싹, 희귀 새싹, 꾸벅이, 말썽)
  blob('resident-sprout', 0xa8e07e, 0x86c05e, 'happy', () => { px(7, 0, 0x3f8f3a, 2, 1); px(8, -1, 0x3f8f3a); });
  blob('resident-sprout-rare', 0xf6dd6b, 0xe0bf45, 'happy', () => { px(2, 1, 0xffffff); px(13, 4, 0xffffff); px(7, 0, 0x3f8f3a, 2, 1); });
  blob('resident-sleepy', 0x9cc7f0, 0x7aa6d6, 'happy', () => { px(3, 0, 0x4b5fa8, 10, 2); px(12, 2, 0xffffff, 2, 2); px(5, 5, OUTLINE, 2, 1); px(10, 5, OUTLINE, 2, 1); });
  blob('resident-trouble', 0xf08c7a, 0xd06c5a, 'grumpy', () => { px(11, 6, 0xf5e1c0, 3, 2); });

  // 내 캐릭터 (16×24 칸)
  px(4, 0, OUTLINE, 8, 1); px(3, 1, OUTLINE, 1, 8); px(12, 1, OUTLINE, 1, 8);
  px(4, 1, 0x6b4a32, 8, 3); px(4, 4, 0xf3d1b0, 8, 5); px(6, 6, OUTLINE); px(9, 6, OUTLINE);
  px(4, 9, OUTLINE, 8, 1); px(3, 10, OUTLINE, 1, 9); px(12, 10, OUTLINE, 1, 9);
  px(4, 10, 0x5aa9e6, 8, 9); px(4, 16, 0x3f86c2, 8, 3);
  px(4, 19, OUTLINE, 3, 4); px(9, 19, OUTLINE, 3, 4); px(5, 19, 0x47506b, 1, 3); px(10, 19, 0x47506b, 1, 3);
  save('player', 16, 24);

  // 광장 물건: 모닥불, 다짐 나무, 응원의 종
  px(2, 12, 0x6b4a32, 12, 3); px(1, 13, OUTLINE, 14, 1);
  px(5, 4, 0xe2572b, 6, 8); px(6, 2, 0xf08a3a, 4, 9); px(7, 5, 0xf6dd6b, 2, 6);
  save('campfire', 16, 16);

  px(12, 30, OUTLINE, 8, 2); px(13, 20, 0x7a5232, 6, 11); px(14, 20, 0x94673f, 2, 11);
  px(2, 4, OUTLINE, 28, 18); px(3, 2, 0x4e9a45, 26, 18); px(5, 0, 0x4e9a45, 22, 4); px(6, 3, 0x6cbf5a, 10, 6);
  for (const [x, y] of [[8, 12], [18, 8], [23, 14], [12, 6]]) { px(x, y, 0xfaf0d7, 3, 2); px(x + 1, y - 2, 0xd9c9a4, 1, 2); }
  save('pledge-tree', 32, 32);

  px(2, 0, OUTLINE, 12, 2); px(3, 2, OUTLINE, 2, 14); px(11, 2, OUTLINE, 2, 14);
  px(5, 4, OUTLINE, 6, 7); px(6, 4, 0xe0b23a, 4, 6); px(6, 4, 0xf6dd6b, 1, 5); px(7, 11, OUTLINE, 2, 2);
  save('bell', 16, 16);

  g.destroy();
}
