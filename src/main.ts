import Phaser from 'phaser';
import { PIXEL_SCALE } from './config';
import { MAP_HEIGHT_PX, MAP_WIDTH_PX, VillageScene } from './scenes/VillageScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: MAP_WIDTH_PX,
  height: MAP_HEIGHT_PX,
  zoom: PIXEL_SCALE,
  pixelArt: true,
  backgroundColor: '#1d1b2a',
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [VillageScene],
});
