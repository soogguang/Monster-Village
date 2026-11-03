import Phaser from 'phaser';
import { VillageScene } from './scenes/VillageScene';
import { GameStore, LocalStorage } from './store';
import { mountTaskPanel } from './ui/taskPanel';

const store = new GameStore(new LocalStorage());
mountTaskPanel(document.getElementById('panel')!, store);

// 캔버스는 창 크기 그대로 쓰고, 픽셀 배율은 카메라 줌으로 고정해요.
// (창에 맞춰 화면 전체를 늘리면 픽셀이 지나치게 커져요.)
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1d1b2a',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.RESIZE },
  scene: [new VillageScene(store)],
});
