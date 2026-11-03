// 내 마당 화면 (임시 버전)
// 캐릭터 그림이 완성되기 전까지는 도형으로 그려요. 그림이 생기면 이 파일의 그리기 부분만 바꿔요.

import Phaser from 'phaser';
import { CHARACTER_SIZE, TILE_SIZE } from '../config';
import { addFocus, createTask, doughStage, type DoughStage, type Task } from '../rules/task';

const MAP_COLS = 20;
const MAP_ROWS = 14;
export const MAP_WIDTH_PX = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT_PX = MAP_ROWS * TILE_SIZE;

const PLAYER_SPEED = 70;
const DOUGH_SIZE = CHARACTER_SIZE / 2;

const STAGE_COLORS: Record<DoughStage, number> = {
  soft: 0xf6e7c8,
  grumpy: 0xe0a35a,
  monster: 0x8b5fbf,
};

const STAGE_LABELS: Record<DoughStage, string> = {
  soft: '말랑',
  grumpy: '심술',
  monster: '몬스터',
};

interface DoughView {
  task: Task;
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  zzz: Phaser.GameObjects.Text;
}

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private doughs: DoughView[] = [];
  private focusing = false;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('village');
  }

  create(): void {
    this.drawGround();
    this.physics.world.setBounds(TILE_SIZE, TILE_SIZE, MAP_WIDTH_PX - 2 * TILE_SIZE, MAP_HEIGHT_PX - 2 * TILE_SIZE);

    for (const [i, task] of demoTasks(Date.now()).entries()) {
      this.addDough(task, 5 * TILE_SIZE + i * 4 * TILE_SIZE, 5 * TILE_SIZE);
    }

    this.player = this.add.rectangle(MAP_WIDTH_PX / 2, MAP_HEIGHT_PX - 4 * TILE_SIZE, CHARACTER_SIZE / 2, CHARACTER_SIZE * 0.75, 0x5aa9e6);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'), down: kb.addKey('DOWN'), left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'),
      w: kb.addKey('W'), a: kb.addKey('A'), s: kb.addKey('S'), d: kb.addKey('D'),
    };
    kb.on('keydown-F', () => this.toggleFocus());

    this.statusText = this.add
      .text(TILE_SIZE, 2, '', { fontSize: '8px', color: '#ffffff', resolution: 4 })
      .setDepth(10);
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
  }

  private drawGround(): void {
    const g = this.add.graphics();
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const edge = row === 0 || col === 0 || row === MAP_ROWS - 1 || col === MAP_COLS - 1;
        const checker = (row + col) % 2 === 0;
        g.fillStyle(edge ? 0x6b4f3a : checker ? 0x7cc576 : 0x74bd6e);
        g.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private addDough(task: Task, x: number, y: number): void {
    const body = this.add.rectangle(x, y, DOUGH_SIZE, DOUGH_SIZE * 0.8, STAGE_COLORS.soft);
    const label = this.add
      .text(x, y + DOUGH_SIZE, task.title, { fontSize: '8px', color: '#1d1b2a', resolution: 4 })
      .setOrigin(0.5, 0);
    const zzz = this.add
      .text(x + DOUGH_SIZE / 2, y - DOUGH_SIZE, 'z', { fontSize: '8px', color: '#ffffff', resolution: 4 })
      .setVisible(false);

    // 말랑하게 눌렸다 펴지는 움직임 (그림이 생겨도 같은 방식으로 써요)
    this.tweens.add({ targets: body, scaleY: 0.85, scaleX: 1.1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.doughs.push({ task, body, label, zzz });
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
      d.body.setFillStyle(STAGE_COLORS[stage]);
      d.zzz.setVisible(this.focusing);
      d.label.setText(`${d.task.title} (${this.focusing ? '졸림' : STAGE_LABELS[stage]})`);
    }
    this.statusText.setText(this.focusing ? '집중 중... (F: 그만하기)' : '방향키/WASD: 이동   F: 집중');
  }
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
