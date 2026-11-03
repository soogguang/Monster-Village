// 내 마당 화면 (임시 버전)
// 캐릭터 그림이 완성되기 전까지는 코드로 그린 임시 그림을 써요. 그림이 생기면 텍스처 만드는 부분만 바꿔요.

import Phaser from 'phaser';
import { TILE_SIZE, pickPixelScale } from '../config';
import { addFocus, createTask, doughStage, type DoughStage, type Task } from '../rules/task';

const MAP_COLS = 48;
const MAP_ROWS = 32;
const MAP_WIDTH_PX = MAP_COLS * TILE_SIZE;
const MAP_HEIGHT_PX = MAP_ROWS * TILE_SIZE;
const PLAYER_SPEED = 80;
/** 이름표 같은 글씨는 픽셀 배율과 상관없이 또렷하게 보이도록 이 크기(화면 픽셀)로 그려요. */
const LABEL_FONT_PX = 13;

const STAGE_LABELS: Record<DoughStage, string> = { soft: '말랑', grumpy: '심술', monster: '몬스터' };

interface DoughView {
  task: Task;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  zzz: Phaser.GameObjects.Text;
}

type MoveKeys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private keys!: MoveKeys;
  private doughs: DoughView[] = [];
  private focusing = false;
  private hud = document.getElementById('hud');

  constructor(private pixelScale: number) {
    super('village');
  }

  create(): void {
    makePlaceholderTextures(this);
    this.drawGround();

    const playArea = new Phaser.Geom.Rectangle(TILE_SIZE, TILE_SIZE, MAP_WIDTH_PX - 2 * TILE_SIZE, MAP_HEIGHT_PX - 2 * TILE_SIZE);
    this.physics.world.setBounds(playArea.x, playArea.y, playArea.width, playArea.height);

    const center = { x: MAP_WIDTH_PX / 2, y: MAP_HEIGHT_PX / 2 };
    for (const [i, task] of demoTasks(Date.now()).entries()) {
      this.addDough(task, center.x + (i - 1) * 3 * TILE_SIZE, center.y - 2 * TILE_SIZE);
    }

    this.player = this.add.image(center.x, center.y + 3 * TILE_SIZE, 'player');
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true).setSize(12, 8).setOffset(2, 16);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX);
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.applyPixelScale();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.pixelScale = pickPixelScale(window.innerHeight);
      this.applyPixelScale();
    });

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'), down: kb.addKey('DOWN'), left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'),
      w: kb.addKey('W'), a: kb.addKey('A'), s: kb.addKey('S'), d: kb.addKey('D'),
    };
    kb.on('keydown-F', () => this.toggleFocus());

    this.refreshDoughs();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshDoughs() });
  }

  update(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const k = this.keys;
    const dx = Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const dy = Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(PLAYER_SPEED);
    body.setVelocity(v.x, v.y);
    if (dx !== 0) this.player.setFlipX(dx < 0);
    this.player.setDepth(this.player.y);
  }

  private applyPixelScale(): void {
    this.cameras.main.setZoom(this.pixelScale);
    // 글씨는 줌만큼 줄여 두어서, 화면에서는 항상 같은 크기로 또렷하게 보여요.
    for (const d of this.doughs) {
      d.label.setScale(1 / this.pixelScale);
      d.zzz.setScale(1 / this.pixelScale);
    }
  }

  private drawGround(): void {
    const rt = this.add.renderTexture(0, 0, MAP_WIDTH_PX, MAP_HEIGHT_PX).setOrigin(0).setDepth(-1);
    const rng = new Phaser.Math.RandomDataGenerator(['village']);
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const edge = row === 0 || col === 0 || row === MAP_ROWS - 1 || col === MAP_COLS - 1;
        const path = col === Math.floor(MAP_COLS / 2) || col === Math.floor(MAP_COLS / 2) - 1;
        const key = edge ? 'fence' : path && row > MAP_ROWS / 2 ? 'dirt' : `grass-${rng.between(0, 3)}`;
        rt.draw(key, col * TILE_SIZE, row * TILE_SIZE);
      }
    }
  }

  private addDough(task: Task, x: number, y: number): void {
    const sprite = this.add.image(x, y, 'dough-soft').setOrigin(0.5, 1).setDepth(y);
    const label = this.makeLabel(x, y + 2, task.title, '#2b2433').setOrigin(0.5, 0);
    const zzz = this.makeLabel(x + 8, y - 16, 'z z', '#ffffff').setVisible(false);

    // 말랑하게 눌렸다 펴지는 움직임 (그림이 생겨도 같은 방식으로 써요)
    this.tweens.add({ targets: sprite, scaleY: 0.88, scaleX: 1.08, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.doughs.push({ task, sprite, label, zzz });
  }

  private makeLabel(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: 'sans-serif', fontSize: `${LABEL_FONT_PX}px`, color, resolution: 2 })
      .setScale(1 / this.pixelScale)
      .setDepth(10_000);
  }

  private toggleFocus(): void {
    this.focusing = !this.focusing;
    if (this.focusing) {
      // 임시: 집중을 시작하면 모든 할 일에 집중 1분을 기록해요. 실제로는 고른 할 일 하나에 타이머 시간만큼 쌓여요.
      for (const d of this.doughs) d.task = addFocus(d.task, 1);
    }
    this.refreshDoughs();
  }

  private refreshDoughs(): void {
    const now = Date.now();
    for (const d of this.doughs) {
      const stage = doughStage(d.task, now);
      d.sprite.setTexture(`dough-${stage}`);
      d.zzz.setVisible(this.focusing);
      d.label.setText(`${d.task.title} · ${this.focusing ? '졸림' : STAGE_LABELS[stage]}`);
    }
    if (this.hud) {
      this.hud.textContent = this.focusing ? '집중 중… (F: 그만하기)' : '방향키/WASD: 이동 · F: 집중';
    }
  }
}

/** 실제 그림이 오기 전까지 쓰는 임시 그림들. 명암과 외곽선을 조금 넣어 최종 느낌에 가깝게 해요. */
function makePlaceholderTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({}, false);
  const rng = new Phaser.Math.RandomDataGenerator(['tiles']);
  const px = (x: number, y: number, color: number, w = 1, h = 1) => g.fillStyle(color).fillRect(x, y, w, h);
  const save = (key: string, w: number, h: number) => {
    g.generateTexture(key, w, h);
    g.clear();
  };

  for (let v = 0; v < 4; v++) {
    px(0, 0, 0x78c25a, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 6; i++) {
      const x = rng.between(1, TILE_SIZE - 2);
      const y = rng.between(2, TILE_SIZE - 1);
      px(x, y, 0x5fa548);
      px(x, y - 1, 0x5fa548);
      px(x + 1, y, 0x9ad66f);
    }
    if (v === 3) {
      px(5, 6, 0xffffff); px(4, 7, 0xffffff); px(6, 7, 0xffffff); px(5, 8, 0xffffff); px(5, 7, 0xf2c84b);
    }
    save(`grass-${v}`, TILE_SIZE, TILE_SIZE);
  }

  px(0, 0, 0xc9995f, TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < 8; i++) px(rng.between(0, 15), rng.between(0, 15), rng.pick([0xb3854f, 0xd9ad74]));
  save('dirt', TILE_SIZE, TILE_SIZE);

  px(0, 0, 0x78c25a, TILE_SIZE, TILE_SIZE);
  px(2, 3, 0x3b2a20, 4, 12); px(10, 3, 0x3b2a20, 4, 12);
  px(3, 4, 0xa0703f, 2, 10); px(11, 4, 0xa0703f, 2, 10);
  px(0, 6, 0x3b2a20, 16, 3); px(0, 7, 0xb98249, 16, 1);
  px(0, 11, 0x3b2a20, 16, 3); px(0, 12, 0xb98249, 16, 1);
  save('fence', TILE_SIZE, TILE_SIZE);

  const blob = (key: string, fill: number, shade: number, brows: boolean) => {
    const W = 16, H = 13, outline = 0x3a2b2b;
    px(3, 0, outline, 10, 1); px(1, 1, outline, 2, 2); px(13, 1, outline, 2, 2);
    px(0, 3, outline, 1, 8); px(15, 3, outline, 1, 8); px(1, 11, outline, 14, 1); px(2, 12, outline, 12, 1);
    px(3, 1, fill, 10, 2); px(1, 3, fill, 14, 8); px(2, 11, shade, 12, 1); px(1, 8, shade, 14, 3);
    px(4, 2, 0xffffff, 2, 1);
    px(5, 5, outline, 1, 2); px(10, 5, outline, 1, 2);
    if (brows) { px(4, 4, outline, 2, 1); px(10, 4, outline, 2, 1); px(7, 8, outline, 2, 1); }
    else { px(4, 7, 0xf4a0a0); px(11, 7, 0xf4a0a0); px(7, 8, outline, 2, 1); }
    save(key, W, H);
  };
  blob('dough-soft', 0xfaf0d7, 0xe8d7b4, false);
  blob('dough-grumpy', 0xf2b469, 0xd99550, true);
  blob('dough-monster', 0x9a6fd0, 0x7a52b0, true);

  // 임시 내 캐릭터 (16×24 칸, 규격의 32×32 칸 안에 들어가는 크기)
  const o = 0x2b2433;
  px(4, 0, o, 8, 1); px(3, 1, o, 1, 8); px(12, 1, o, 1, 8);
  px(4, 1, 0x6b4a32, 8, 3); px(4, 4, 0xf3d1b0, 8, 5); px(6, 6, o); px(9, 6, o);
  px(4, 9, o, 8, 1); px(3, 10, o, 1, 9); px(12, 10, o, 1, 9);
  px(4, 10, 0x5aa9e6, 8, 9); px(4, 16, 0x3f86c2, 8, 3);
  px(4, 19, o, 3, 4); px(9, 19, o, 3, 4); px(5, 19, 0x47506b, 1, 3); px(10, 19, 0x47506b, 1, 3);
  save('player', 16, 24);
  g.destroy();
}

/** 화면 확인용 임시 할 일들 (DB가 연결되면 지워요) */
function demoTasks(now: number): Task[] {
  const day = 24 * 60 * 60 * 1000;
  return [
    createTask({ id: 'demo-1', title: '영어 단어', startAt: now + day, dueAt: now + 3 * day }),
    createTask({ id: 'demo-2', title: '보고서', startAt: now - day, dueAt: now + 2 * day }),
    createTask({ id: 'demo-3', title: '빨래', startAt: now - 3 * day, dueAt: now - day }),
  ];
}
