// 동네 화면: 광장 + 마당 세 개 (가운데가 내 마당)
// 화면은 저장소(GameStore)의 상태를 그대로 그리기만 해요. 상태를 바꾸는 건 할 일 패널이 해요.

import Phaser from 'phaser';
import { TILE_SIZE, pickPixelScale } from '../config';
import { doughStage, type DoughStage, type Task } from '../rules/task';
import type { GameState, GameStore, Resident } from '../store';
import { MAP_COLS, MAP_ROWS, PLAZA_SPOTS, YARDS, buildTiles, isBlocked, type Yard } from '../world/layout';
import { makePlaceholderTextures } from './textures';

const MAP_W = MAP_COLS * TILE_SIZE;
const MAP_H = MAP_ROWS * TILE_SIZE;
/** 초당 이동 거리 (타일 5.6칸) */
const PLAYER_SPEED = TILE_SIZE * 5.6;
/** 이름표는 픽셀 배율과 상관없이 이 크기(화면 픽셀)로 또렷하게 그려요. */
const LABEL_FONT_PX = 13;

const STAGE_LABELS: Record<DoughStage, string> = { soft: '말랑', grumpy: '심술', monster: '몬스터' };

interface DoughView {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  zzz: Phaser.GameObjects.Text;
}

type MoveKeys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private keys!: MoveKeys;
  private doughViews = new Map<string, DoughView>();
  private residentViews = new Map<string, Phaser.GameObjects.Image>();
  private labels: Phaser.GameObjects.Text[] = [];
  private pixelScale = pickPixelScale(window.innerHeight);
  private myYard = YARDS.find((y) => y.owner === 'me')!;

  constructor(
    private store: GameStore,
    private characterDir: string,
  ) {
    super('village');
  }

  /** catalog.json에 적힌 캐릭터 그림을 불러와요. 없는 파일은 건너뛰고 임시 그림을 써요. */
  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      console.warn(`[캐릭터 그림] ${file.url} 을(를) 불러오지 못했어요. 임시 그림으로 보여줄게요.`),
    );
    for (const c of this.store.getCatalog()) this.load.image(characterKey(c.id), `${this.characterDir}${c.image}`);
  }

  create(): void {
    makePlaceholderTextures(this);
    const tiles = buildTiles();
    this.drawGround(tiles);
    this.addFenceColliders(tiles);
    this.addPlaza();
    for (const yard of YARDS) this.addYardSign(yard);
    this.addFriendDemoResidents();

    const start = this.yardSpot(this.myYard, 0.5, 0.75);
    this.player = this.add.image(start.x, start.y, 'player').setOrigin(0.5, 1);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // 발밑만 부딪히게 해요. (그림 크기는 타일 기준 비율로 계산)
    body.setCollideWorldBounds(true).setSize(TILE_SIZE * 0.75, TILE_SIZE * 0.375).setOffset(TILE_SIZE * 0.125, TILE_SIZE * 1.125);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
    this.physics.add.collider(this.player, this.fenceGroup);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.applyPixelScale();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyPixelScale());

    // 입력창에 글자를 칠 때 W·A·S·D가 막히지 않도록 키를 가로채지 않아요.
    const kb = this.input.keyboard!;
    const key = (k: string) => kb.addKey(k, false);
    this.keys = { up: key('UP'), down: key('DOWN'), left: key('LEFT'), right: key('RIGHT'), w: key('W'), a: key('A'), s: key('S'), d: key('D') };

    this.render(this.store.get());
    const unsubscribe = this.store.subscribe((s) => this.render(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.render(this.store.get()) });
  }

  update(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const typing = document.activeElement instanceof HTMLInputElement;
    const k = this.keys;
    const dx = typing ? 0 : Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const dy = typing ? 0 : Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(PLAYER_SPEED);
    body.setVelocity(v.x, v.y);
    if (dx !== 0) this.player.setFlipX(dx < 0);
    this.player.setDepth(this.player.y);
  }

  // ---------- 상태 그리기 ----------

  private render(state: GameState): void {
    const now = Date.now();
    const active = state.tasks.filter((t) => t.completedAt === undefined);

    for (const [id, view] of this.doughViews) {
      if (!active.some((t) => t.id === id)) {
        view.sprite.destroy(); view.label.destroy(); view.zzz.destroy();
        this.doughViews.delete(id);
      }
    }
    active.forEach((task, i) => {
      const view = this.doughViews.get(task.id) ?? this.addDough(task, i);
      const stage = doughStage(task, now);
      const sleepy = state.focus?.taskId === task.id;
      view.sprite.setTexture(`dough-${stage}`);
      view.zzz.setVisible(sleepy);
      view.label.setText(`${shorten(task.title)}\n${sleepy ? '졸림' : STAGE_LABELS[stage]}`);
    });

    state.residents.forEach((r, i) => {
      if (!this.residentViews.has(r.id)) this.residentViews.set(r.id, this.addResident(this.myYard, r, i, true));
    });
  }

  private addDough(task: Task, index: number): DoughView {
    // 내 마당 위쪽 절반에 한 줄에 4개씩 놓아요. (이름표가 겹치지 않을 만큼 띄워요)
    const col = index % 4;
    const row = Math.floor(index / 4);
    const { x, y } = this.yardSpot(this.myYard, 0.14 + col * 0.24, 0.16 + row * 0.16);
    const sprite = this.add.image(x, y, 'dough-soft').setOrigin(0.5, 1).setDepth(y);
    this.tweens.add({ targets: sprite, scaleY: 0.88, scaleX: 1.08, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const view = {
      sprite,
      label: this.makeLabel(x, y + TILE_SIZE * 0.125, task.title, '#2b2433').setOrigin(0.5, 0).setAlign('center'),
      zzz: this.makeLabel(x + TILE_SIZE * 0.5, y - TILE_SIZE * 1.125, 'z z', '#ffffff').setVisible(false),
    };
    this.doughViews.set(task.id, view);
    return view;
  }

  private addResident(yard: Yard, r: Pick<Resident, 'kind' | 'rare' | 'speciesId'>, index: number, bornNow: boolean): Phaser.GameObjects.Image {
    const rng = new Phaser.Math.RandomDataGenerator([`${yard.name}-${index}`]);
    const home = this.yardSpot(yard, rng.realInRange(0.15, 0.85), rng.realInRange(0.55, 0.9));
    const placeholder = r.kind === 'sprout' && r.rare ? 'resident-sprout-rare' : `resident-${r.kind}`;
    const key = r.speciesId && this.textures.exists(characterKey(r.speciesId)) ? characterKey(r.speciesId) : placeholder;
    const sprite = this.add.image(home.x, home.y, key).setOrigin(0.5, 1).setDepth(home.y);
    if (bornNow && this.time.now > 2000) {
      sprite.setScale(0);
      this.tweens.add({ targets: sprite, scale: 1, duration: 500, ease: 'Back.Out' });
    }
    this.wander(sprite, yard, rng);
    return sprite;
  }

  /** 주민이 마당 안에서 통통 튀며 천천히 돌아다녀요. */
  private wander(sprite: Phaser.GameObjects.Image, yard: Yard, rng: Phaser.Math.RandomDataGenerator): void {
    const next = this.yardSpot(yard, rng.realInRange(0.1, 0.9), rng.realInRange(0.5, 0.92));
    sprite.setFlipX(next.x < sprite.x);
    this.tweens.add({
      targets: sprite,
      x: next.x,
      y: next.y,
      // 주민은 초당 타일 1칸 정도로 느긋하게 걸어요.
      duration: (Phaser.Math.Distance.Between(sprite.x, sprite.y, next.x, next.y) / TILE_SIZE) * 960,
      delay: rng.between(800, 3000),
      onUpdate: () => sprite.setDepth(sprite.y),
      onComplete: () => this.wander(sprite, yard, rng),
    });
  }

  // ---------- 맵 ----------

  private fenceGroup!: Phaser.Physics.Arcade.StaticGroup;

  private drawGround(tiles: ReturnType<typeof buildTiles>): void {
    const rt = this.add.renderTexture(0, 0, MAP_W, MAP_H).setOrigin(0).setDepth(-1);
    const rng = new Phaser.Math.RandomDataGenerator(['village']);
    // 타일 수천 개를 한 번에 묶어서 그려요. 하나씩 그리면 시작할 때 화면이 오래 멈춰요.
    rt.beginDraw();
    tiles.forEach((row, r) =>
      row.forEach((tile, c) => rt.batchDraw(tile === 'grass' ? `grass-${rng.weightedPick([0, 1, 2, 3])}` : tile, c * TILE_SIZE, r * TILE_SIZE)),
    );
    rt.endDraw();
  }

  /** 울타리 타일을 가로로 이어진 덩어리 단위로 묶어서 부딪힘 상자를 만들어요. */
  private addFenceColliders(tiles: ReturnType<typeof buildTiles>): void {
    this.fenceGroup = this.physics.add.staticGroup();
    tiles.forEach((row, r) => {
      let runStart = -1;
      for (let c = 0; c <= MAP_COLS; c++) {
        const blocked = c < MAP_COLS && isBlocked(row[c]);
        if (blocked && runStart < 0) runStart = c;
        if (!blocked && runStart >= 0) {
          const w = (c - runStart) * TILE_SIZE;
          const zone = this.add.zone(runStart * TILE_SIZE + w / 2, r * TILE_SIZE + TILE_SIZE / 2, w, TILE_SIZE);
          this.fenceGroup.add(zone);
          runStart = -1;
        }
      }
    });
  }

  private addPlaza(): void {
    const place = (spot: { col: number; row: number }, key: string, label: string) => {
      const x = (spot.col + 0.5) * TILE_SIZE;
      const y = (spot.row + 1) * TILE_SIZE;
      const obj = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
      this.makeLabel(x, y + TILE_SIZE * 0.125, label, '#2b2433').setOrigin(0.5, 0);
      return obj;
    };
    const fire = place(PLAZA_SPOTS.campfire, 'campfire', '모닥불');
    this.tweens.add({ targets: fire, scaleY: 1.08, duration: 300, yoyo: true, repeat: -1 });
    place(PLAZA_SPOTS.pledgeTree, 'pledge-tree', '다짐 나무');
    place(PLAZA_SPOTS.bell, 'bell', '응원의 종');
  }

  private addYardSign(yard: Yard): void {
    const { x, y } = this.yardSpot(yard, 0.5, 0);
    this.makeLabel(x, y - TILE_SIZE * 1.25, yard.name, '#ffffff').setOrigin(0.5, 1).setBackgroundColor('#2b2433cc').setPadding(6, 2, 6, 2);
  }

  /** 친구 마당 확인용 임시 주민들 (동네 기능이 연결되면 실제 친구 데이터로 바꿔요) */
  private addFriendDemoResidents(): void {
    const demo: Pick<Resident, 'kind' | 'rare' | 'speciesId'>[] = [
      { kind: 'sprout', rare: false, speciesId: null },
      { kind: 'sprout', rare: true, speciesId: null },
      { kind: 'sleepy', rare: false, speciesId: null },
      { kind: 'trouble', rare: false, speciesId: null },
    ];
    for (const yard of YARDS.filter((y) => y.owner === 'friend')) demo.forEach((r, i) => this.addResident(yard, r, i, false));
  }

  /** 마당 안의 비율 위치(0~1)를 월드 좌표로 바꿔요. 울타리 안쪽 기준이에요. */
  private yardSpot(yard: Yard, fx: number, fy: number): { x: number; y: number } {
    const { col, row, cols, rows } = yard.rect;
    return {
      x: (col + 1 + fx * (cols - 2)) * TILE_SIZE,
      y: (row + 1 + fy * (rows - 2)) * TILE_SIZE,
    };
  }

  // ---------- 화면 배율과 글씨 ----------

  private applyPixelScale(): void {
    // 화면이 맵보다 커지면 바깥 빈 공간이 보이지 않도록 배율을 올려요.
    const base = pickPixelScale(window.innerHeight);
    this.pixelScale = Math.max(base, Math.ceil(this.scale.width / MAP_W), Math.ceil(this.scale.height / MAP_H));
    this.cameras.main.setZoom(this.pixelScale);
    for (const label of this.labels) label.setScale(1 / this.pixelScale);
  }

  private makeLabel(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    const label = this.add
      .text(x, y, text, { fontFamily: 'sans-serif', fontSize: `${LABEL_FONT_PX}px`, color, resolution: 2 })
      .setScale(1 / this.pixelScale)
      .setDepth(100_000);
    this.labels.push(label);
    label.once(Phaser.GameObjects.Events.DESTROY, () => (this.labels = this.labels.filter((l) => l !== label)));
    return label;
  }
}

function characterKey(id: string): string {
  return `char-${id}`;
}

function shorten(title: string, max = 10): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
