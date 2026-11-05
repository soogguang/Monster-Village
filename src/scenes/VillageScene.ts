// 동네 화면
// - 위쪽: 방 멤버마다 마당과 집 (멤버 수만큼 좌우로 늘어나요, 혼자면 내 마당 하나)
// - 아래쪽: 큰길과 광장 (수호나무 = 공동 할 일, 모닥불 = 같이 집중, 응원의 종)
// 화면은 저장소(GameStore)와 방 상태(roomView)를 그대로 그리기만 해요.

import Phaser from 'phaser';
import { FRIENDSHIP, TILE_SIZE, pickPixelScale } from '../config';
import { roomView, type RoomViewState } from '../net/rooms';
import { doughStage, type DoughStage, type Task } from '../rules/task';
import type { GameState, GameStore, Resident } from '../store';
import { HOUSE_TILES, buildTiles, createVillageLayout, withMinWidth, type Rect, type Spot, type VillageLayout, type YardPlan } from '../world/layout';
import { MEADOW_TILES, grassTileAt, villageDecor } from '../world/decor';
import { makePlaceholderTextures } from './textures';

const T = TILE_SIZE;
/** 초당 이동 거리 (타일 5.6칸) */
const PLAYER_SPEED = T * 5.6;
/** 이름표는 픽셀 배율과 상관없이 이 크기(화면 픽셀)로 또렷하게 그려요. */
const LABEL_FONT_PX = 13;
/** 맵의 최소 폭(타일). 이보다 좁으면 양옆에 풀밭을 깔아요 */
const MIN_WORLD_COLS = 72;
/** 혼자일 때 내 마당의 주인 이름 */
const SOLO_ID = 'me';
/** 그리는 순서: 바닥 층은 맨 아래, 이름표는 맨 위. 나머지는 발밑 y값 (위쪽 마당은 y가 음수라 0보다 훨씬 아래에 둬요) */
const DEPTH = { ground: -10_000_000, overlay: -9_999_999, flatDecor: -9_999_998, label: 10_000_000 } as const;

const STAGE_LABELS: Record<DoughStage, string> = { soft: '말랑', grumpy: '심술', monster: '몬스터' };

/** 바닥 타일 묶음(타일셋)의 순서. 타일맵은 이 번호로 그려요 */
const TERRAIN_KEYS = ['grass-01', 'grass-02', 'grass-03', 'grass-04', 'dirt', 'stone', 'fence-h', 'fence-v', 'fence-corner', ...MEADOW_TILES] as const;
const TILE_INDEX = Object.fromEntries(TERRAIN_KEYS.map((k, i) => [k, i])) as Record<string, number>;

export interface WorldAsset {
  key: string;
  url: string;
}

interface DoughView {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  zzz: Phaser.GameObjects.Text;
}

type MoveKeys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private keys!: MoveKeys;
  private labels: Phaser.GameObjects.Text[] = [];
  private pixelScale = pickPixelScale(window.innerHeight);

  // 지금 그려 둔 마을 (방 멤버가 바뀌면 통째로 다시 지어요)
  private layout!: VillageLayout;
  private layoutKey = '';
  private myYard!: YardPlan;
  private world: { map: Phaser.Tilemaps.Tilemap; things: Phaser.GameObjects.GameObject[]; colliders: Phaser.Physics.Arcade.Collider[] } | null = null;
  private blockers!: Phaser.Physics.Arcade.StaticGroup;

  private doughViews = new Map<string, DoughView>();
  private residentViews = new Map<string, Phaser.GameObjects.Image>();
  /** 주민별 친밀도 (♥가 오르면 하트를 띄우고, 친해진 주민은 가끔 인사하러 와요) */
  private residentHearts = new Map<string, number>();
  private yardSigns = new Map<string, Phaser.GameObjects.Text>();
  /** 친구 마당마다 지금 그려 둔 주민 그림 */
  private friendYards = new Map<string, { key: string; sprites: Phaser.GameObjects.Image[] }>();
  private campfire!: Phaser.GameObjects.Sprite;
  private campfireLabel!: Phaser.GameObjects.Text;
  private treeLabel!: Phaser.GameObjects.Text;

  constructor(
    private store: GameStore,
    private characterDir: string,
    private worldAssets: WorldAsset[],
  ) {
    super('village');
  }

  /** 캐릭터(catalog.json)와 배경(village-assets.json) 그림을 불러와요. 없는 파일은 임시 그림으로 대신해요. */
  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      console.warn(`[그림] ${file.url} 을(를) 불러오지 못했어요. 임시 그림으로 보여줄게요.`),
    );
    for (const c of this.store.getCatalog()) this.load.image(characterKey(c.id), `${this.characterDir}${c.image}`);
    for (const a of this.worldAssets) this.load.image(a.key, a.url);
  }

  create(): void {
    makePlaceholderTextures(this);
    this.buildTerrainTileset();
    this.anims.create({ key: 'campfire-burn', frames: [{ key: 'campfire-01' }, { key: 'campfire-02' }], frameRate: 4, repeat: -1 });
    this.blockers = this.physics.add.staticGroup();

    this.player = this.add.image(0, 0, 'player').setOrigin(0.5, 1);
    this.physics.add.existing(this.player);
    // 발밑만 부딪히게 해요.
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true).setSize(T * 0.75, T * 0.375).setOffset(
      (this.player.width - T * 0.75) / 2,
      this.player.height - T * 0.5,
    );
    this.physics.add.collider(this.player, this.blockers);

    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.applyPixelScale();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyPixelScale());

    // 입력창에 글자를 칠 때 W·A·S·D가 막히지 않도록 키를 가로채지 않아요.
    const kb = this.input.keyboard!;
    const key = (k: string) => kb.addKey(k, false);
    this.keys = { up: key('UP'), down: key('DOWN'), left: key('LEFT'), right: key('RIGHT'), w: key('W'), a: key('A'), s: key('S'), d: key('D') };

    this.refreshLayout();
    const unsubscribeRoom = roomView.subscribe((rs) => {
      this.refreshLayout();
      this.renderRoom(rs);
    });
    const unsubscribe = this.store.subscribe((s) => this.render(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { unsubscribeRoom(); unsubscribe(); });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.render(this.store.get()) });
  }

  update(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // 입력창에 글자를 치거나 창이 열려 있으면 캐릭터가 움직이지 않아요.
    const typing =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLSelectElement ||
      document.body.dataset.modal === 'open';
    const k = this.keys;
    const dx = typing ? 0 : Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const dy = typing ? 0 : Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(PLAYER_SPEED);
    body.setVelocity(v.x, v.y);
    if (dx !== 0) this.player.setFlipX(dx < 0);
    // 위로 걸으면 뒷모습, 아래·옆으로 걸으면 앞모습
    if (dy < 0 && this.textures.exists('player-back')) this.player.setTexture('player-back');
    else if (dy > 0 || dx !== 0) this.player.setTexture('player');
    this.player.setDepth(this.player.y);
  }

  // ---------------------------------------------------------------- 마을 짓기

  /** 방 멤버와 자리 배정으로 마을 배치를 정하고, 바뀌었을 때만 다시 지어요. */
  private refreshLayout(): void {
    const rs = roomView.state;
    const inRoom = rs.active !== null && rs.members.length > 0 && rs.backend !== null;
    const memberIds = inRoom ? rs.members.map((m) => m.userId) : [SOLO_ID];
    const myId = inRoom ? rs.backend!.me.id : SOLO_ID;
    // 노트북(1배)에서도 화면이 맵보다 넓지 않게 최소 72칸(2,304px) 폭을 보장해요.
    // 아래쪽에는 버튼 줄에 광장이 가리지 않도록 풀밭 몇 줄을 더 깔아요.
    const layout = withMinWidth(createVillageLayout(memberIds, inRoom ? rs.slots : []), MIN_WORLD_COLS, 4);
    const key = JSON.stringify([myId, layout.assignments]);
    if (key === this.layoutKey) return;
    const myYardBefore = this.myYard?.rect;
    this.layoutKey = key;
    this.layout = layout;
    this.myYard = layout.yards.find((y) => y.userId === myId)!;
    this.buildWorld();
    // 처음이거나 내 마당 위치가 바뀌었으면 내 마당 문 앞에서 시작해요.
    if (!myYardBefore || myYardBefore.col !== this.myYard.rect.col) {
      const g = this.myYard.gate;
      this.player.setPosition((g.col + g.cols / 2) * T, (g.row - 1) * T);
    }
    this.render(this.store.get());
    this.renderRoom(rs);
  }

  private buildWorld(): void {
    this.destroyWorld();
    const { bounds } = this.layout;
    const tiles = buildTiles(this.layout);
    const things: Phaser.GameObjects.GameObject[] = [];

    // 바닥과 울타리: 타일맵은 화면에 보이는 부분만 그려서 마당이 많아도 가벼워요.
    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: bounds.cols, height: bounds.rows });
    const tileset = map.addTilesetImage('terrain', 'terrain-tiles', T, T, 0, 0)!;
    const ground = map.createBlankLayer('ground', tileset, bounds.col * T, bounds.row * T)!.setDepth(DEPTH.ground);
    const overlay = map.createBlankLayer('overlay', tileset, bounds.col * T, bounds.row * T)!.setDepth(DEPTH.overlay);
    tiles.ground.forEach((row, r) =>
      row.forEach((t, c) => {
        // 풀 자리는 마당 테마에 맞는 꽃 풀밭을 무리 지어 섞어요.
        const index = t === 'grass' ? TILE_INDEX[grassTileAt(this.layout, c + bounds.col, r + bounds.row)] : TILE_INDEX[t];
        ground.putTileAt(index, c, r);
      }),
    );
    tiles.overlay.forEach((row, r) => row.forEach((t, c) => { if (t) overlay.putTileAt(TILE_INDEX[t], c, r); }));
    overlay.setCollision([TILE_INDEX['fence-h'], TILE_INDEX['fence-v'], TILE_INDEX['fence-corner']]);
    const colliders = [this.physics.add.collider(this.player, overlay)];

    // 집: 벽과 입구 쪽만 막아요.
    for (const yard of this.layout.yards) {
      const x = yard.house.col * T;
      const y = (yard.house.row + 1) * T;
      if (this.textures.exists(yard.house.texture)) things.push(this.add.image(x, y, yard.house.texture).setOrigin(0.5, 1).setDepth(y));
      this.block(x, y - T * 0.9, T * (HOUSE_TILES - 0.6), T * 1.6);
      const sign = this.makeLabel((yard.gate.col + yard.gate.cols / 2) * T, (yard.gate.row + 1) * T + 4, '', '#ffffff')
        .setOrigin(0.5, 0).setBackgroundColor('#2b2433cc').setPadding(6, 2, 6, 2);
      things.push(sign);
      this.yardSigns.set(yard.userId, sign);
    }

    // 꾸미기 장식: 나무·관목·꽃·생활 소품. 꽃과 풀은 지나갈 수 있고, 나머지는 발밑만 막아요.
    for (const d of villageDecor(this.layout)) {
      if (!this.textures.exists(d.key)) continue;
      const x = d.x * T;
      const y = d.y * T;
      things.push(this.add.image(x, y, d.key).setOrigin(0.5, 1).setDepth(d.layer === 'ground' ? DEPTH.flatDecor : y));
      if (d.block) this.block(x, y - (d.block.h * T) / 2, d.block.w * T, d.block.h * T);
    }

    // 광장: 수호나무(공동 할 일), 모닥불(같이 집중), 응원의 종
    const { guardianTree, campfire, bell } = this.layout.anchors;
    const tree = this.placeObject(guardianTree, 'pledge-tree');
    this.treeLabel = this.plazaLabel(tree.x, tree.y + 4, '수호나무');
    this.block(tree.x, tree.y - T * 0.5, T * 2, T);

    this.campfire = this.add.sprite(...spotXY(campfire), 'campfire-01').setOrigin(0.5, 1).play('campfire-burn');
    this.campfire.setDepth(this.campfire.y);
    this.campfireLabel = this.plazaLabel(this.campfire.x, this.campfire.y + 4, '모닥불');
    this.block(this.campfire.x, this.campfire.y - T * 0.6, T * 3, T * 1.2);

    const bellObj = this.placeObject(bell, 'bell');
    const bellLabel = this.plazaLabel(bellObj.x, bellObj.y + 4, '응원의 종');
    for (const side of [-1, 1]) this.block(bellObj.x + side * T * 1.05, bellObj.y - T * 0.3, T * 0.6, T * 0.6);
    things.push(tree, this.campfire, bellObj, this.treeLabel, this.campfireLabel, bellLabel);

    // 이동 범위와 카메라
    const w = bounds.cols * T;
    const h = bounds.rows * T;
    this.physics.world.setBounds(bounds.col * T, bounds.row * T, w, h);
    this.cameras.main.setBounds(bounds.col * T, bounds.row * T, w, h);
    this.applyPixelScale();

    this.world = { map, things, colliders };
  }

  private destroyWorld(): void {
    if (!this.world) return;
    for (const c of this.world.colliders) c.destroy();
    this.world.map.destroy();
    for (const t of this.world.things) t.destroy();
    this.blockers.clear(true, true);
    for (const v of this.doughViews.values()) { v.sprite.destroy(); v.label.destroy(); v.zzz.destroy(); }
    this.doughViews.clear();
    for (const s of this.residentViews.values()) { this.tweens.killTweensOf(s); s.destroy(); }
    this.residentViews.clear();
    for (const { sprites } of this.friendYards.values()) for (const s of sprites) { this.tweens.killTweensOf(s); s.destroy(); }
    this.friendYards.clear();
    this.yardSigns.clear();
    this.world = null;
  }

  /** 바닥 그림들을 한 장의 타일 묶음으로 이어 붙여요. (타일맵이 쓰는 그림) */
  private buildTerrainTileset(): void {
    const canvas = this.textures.createCanvas('terrain-tiles', TERRAIN_KEYS.length * T, T)!;
    TERRAIN_KEYS.forEach((key, i) => {
      // 그림이 없으면 비슷한 것으로 대신해요 (꽃 풀밭 → 기본 풀)
      const source = this.textures.exists(key) ? key : key.startsWith('grass') ? 'grass-01' : 'fence-h';
      canvas.context.drawImage(this.textures.get(source).getSourceImage() as CanvasImageSource, i * T, 0, T, T);
    });
    canvas.refresh();
  }

  /** 광장 물건 이름표: 돌바닥 위에서도 잘 보이게 진한 배경을 깔아요 */
  private plazaLabel(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.makeLabel(x, y, text, '#ffffff').setOrigin(0.5, 0).setBackgroundColor('#2b2433cc').setPadding(6, 2, 6, 2);
  }

  private placeObject(spot: Spot, key: string): Phaser.GameObjects.Image {
    const [x, y] = spotXY(spot);
    return this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
  }

  /** 보이지 않는 부딪힘 상자 (가운데 x, y 기준) */
  private block(x: number, y: number, w: number, h: number): void {
    const zone = this.add.zone(x, y, w, h);
    this.blockers.add(zone);
  }

  // ---------------------------------------------------------------- 내 마당

  private render(state: GameState): void {
    if (!this.world) return;
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

    // 마당에 나오기를 켠 주민만 그려요.
    const shown = state.residents.filter((r) => r.visible);
    for (const [id, sprite] of this.residentViews) {
      if (!shown.some((r) => r.id === id)) {
        this.tweens.killTweensOf(sprite);
        sprite.destroy();
        this.residentViews.delete(id);
      }
    }
    shown.forEach((r, i) => {
      const sprite = this.residentViews.get(r.id);
      if (!sprite) {
        this.residentHearts.set(r.id, r.hearts);
        this.residentViews.set(r.id, this.addResident(this.myYard, r, i, true, () => (this.residentHearts.get(r.id) ?? 0) >= FRIENDSHIP.friendHearts));
      } else if ((this.residentHearts.get(r.id) ?? r.hearts) < r.hearts) {
        this.popHeart(sprite);
      }
      this.residentHearts.set(r.id, r.hearts);
    });
  }

  private addDough(task: Task, index: number): DoughView {
    // 가운데 길 양옆, 장식이 없는 빈터에 두 개씩 한 줄에 4개 놓아요. (가장자리는 정원 장식 자리)
    const columns = [0.29, 0.38, 0.66, 0.75];
    const { x, y } = this.yardSpot(this.myYard, columns[index % 4], 0.5 + Math.floor(index / 4) * 0.14);
    const sprite = this.add.image(x, y, 'dough-soft').setOrigin(0.5, 1).setDepth(y);
    this.tweens.add({ targets: sprite, scaleY: 0.92, scaleX: 1.05, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const view = {
      sprite,
      label: this.makeLabel(x, y + 4, task.title, '#2b2433').setOrigin(0.5, 0).setAlign('center'),
      zzz: this.makeLabel(x + T * 0.6, y - T * 2, 'z z', '#ffffff').setVisible(false),
    };
    this.doughViews.set(task.id, view);
    return view;
  }

  private addResident(
    yard: YardPlan,
    r: Pick<Resident, 'kind' | 'rare' | 'speciesId'>,
    index: number,
    bornNow: boolean,
    isFriend: () => boolean = () => false,
  ): Phaser.GameObjects.Image {
    const rng = new Phaser.Math.RandomDataGenerator([`${yard.userId}-${index}`]);
    const home = this.yardSpot(yard, rng.realInRange(0.15, 0.85), rng.realInRange(0.6, 0.92));
    const placeholder = r.kind === 'sprout' && r.rare ? 'resident-sprout-rare' : `resident-${r.kind}`;
    const key = r.speciesId && this.textures.exists(characterKey(r.speciesId)) ? characterKey(r.speciesId) : placeholder;
    const sprite = this.add.image(home.x, home.y, key).setOrigin(0.5, 1).setDepth(home.y);
    if (bornNow && this.time.now > 2000) {
      sprite.setScale(0);
      this.tweens.add({ targets: sprite, scale: 1, duration: 500, ease: 'Back.Out' });
    }
    this.wander(sprite, yard, rng, isFriend);
    return sprite;
  }

  /** 주민 머리 위로 하트가 떠올라요. (친밀도가 오르거나 인사할 때) */
  private popHeart(sprite: Phaser.GameObjects.Image): void {
    const heart = this.makeLabel(sprite.x, sprite.y - sprite.displayHeight, '♥', '#e0505a').setOrigin(0.5, 1);
    this.tweens.add({ targets: heart, y: heart.y - T * 0.75, alpha: 0, duration: 1400, ease: 'Sine.Out', onComplete: () => heart.destroy() });
  }

  private playerInYard(yard: YardPlan): boolean {
    const { col, row, cols, rows } = yard.rect;
    const x = this.player.x / T;
    const y = this.player.y / T;
    return x > col && x < col + cols && y > row && y < row + rows;
  }

  /**
   * 주민이 마당 아래쪽에서 통통 튀며 천천히 돌아다녀요. (집이 있는 위쪽은 비워 둬요)
   * 친해진 주민(♥3 이상)은 내가 마당에 있으면 가끔 다가와서 하트로 인사해요.
   */
  private wander(sprite: Phaser.GameObjects.Image, yard: YardPlan, rng: Phaser.Math.RandomDataGenerator, isFriend: () => boolean): void {
    if (!sprite.active) return;
    const greet = isFriend() && this.playerInYard(yard) && rng.frac() < 0.35;
    const next = greet
      ? { x: this.player.x + (rng.frac() < 0.5 ? -1 : 1) * T * 1.5, y: this.player.y + T * 0.25 }
      : this.yardSpot(yard, rng.realInRange(0.08, 0.92), rng.realInRange(0.55, 0.92));
    sprite.setFlipX(next.x < sprite.x);
    this.tweens.add({
      targets: sprite,
      x: next.x,
      y: next.y,
      // 주민은 초당 타일 1칸 정도로 느긋하게 걸어요.
      duration: (Phaser.Math.Distance.Between(sprite.x, sprite.y, next.x, next.y) / T) * 960,
      delay: rng.between(800, 3000),
      onUpdate: () => sprite.setDepth(sprite.y),
      onComplete: () => {
        if (greet && sprite.active) this.popHeart(sprite);
        this.wander(sprite, yard, rng, isFriend);
      },
    });
  }

  // ---------------------------------------------------------------- 방 친구들

  /**
   * 방 상태를 마을에 그려요.
   * - 친구 마당: 이름과 접속 상태, 마당에 나온 주민 (구경만)
   * - 모닥불: 같이 집중하는 사람 수만큼 커져요
   * - 나무: 아직 안 끝난 공동 할 일 개수
   */
  private renderRoom(rs: RoomViewState): void {
    if (!this.world) return;
    const online = new Map(rs.online.map((p) => [p.userId, p]));
    for (const yard of this.layout.yards) {
      const sign = this.yardSigns.get(yard.userId);
      if (yard === this.myYard) { sign?.setText('내 마당'); continue; }
      const friend = rs.members.find((m) => m.userId === yard.userId);
      const presence = online.get(yard.userId);
      const badge = presence?.focusingOn ? ' 🔥' : presence ? ' 🟢' : '';
      sign?.setText(`${friend?.nickname ?? '이웃'}의 마당${badge}`);

      const residents = (friend?.save?.residents ?? []).filter((r) => r.visible !== false);
      const key = residents.map((r) => `${r.id}:${r.speciesId}`).join(',');
      if (this.friendYards.get(yard.userId)?.key === key) continue;
      for (const sprite of this.friendYards.get(yard.userId)?.sprites ?? []) { this.tweens.killTweensOf(sprite); sprite.destroy(); }
      const sprites = residents.map((r, n) => this.addResident(yard, { kind: r.kind, rare: r.rare, speciesId: r.speciesId ?? null }, n, false));
      this.friendYards.set(yard.userId, { key, sprites });
    }

    const focusing = roomView.focusingCount();
    // 128×128 모닥불은 최대 1.4배까지만 커져서 나무·종·길을 덮지 않아요.
    this.campfire.setScale(1 + Math.min(focusing, 4) * 0.1);
    this.campfireLabel.setText(rs.active ? `모닥불 · 🔥 ${focusing}명 집중 중` : '모닥불');
    const open = rs.tasks.filter((t) => t.doneAt === null).length;
    this.treeLabel.setText(rs.active ? `수호나무 · 공동 할 일 ${open}개` : '수호나무');
  }

  /** 마당 안의 비율 위치(0~1)를 월드 좌표로 바꿔요. 울타리 안쪽 기준이에요. */
  private yardSpot(yard: YardPlan, fx: number, fy: number): { x: number; y: number } {
    const { col, row, cols, rows } = yard.rect;
    return { x: (col + 1 + fx * (cols - 2)) * T, y: (row + 1 + fy * (rows - 2)) * T };
  }

  // ---------------------------------------------------------------- 화면 배율과 글씨

  private applyPixelScale(): void {
    // 화면이 맵보다 커지면 바깥 빈 공간이 보이지 않도록 배율을 올려요.
    const base = pickPixelScale(window.innerHeight);
    const b: Rect | undefined = this.layout?.bounds;
    const w = b ? b.cols * T : 1;
    const h = b ? b.rows * T : 1;
    this.pixelScale = Math.max(base, Math.ceil(this.scale.width / w), Math.ceil(this.scale.height / h));
    this.cameras.main.setZoom(this.pixelScale);
    for (const label of this.labels) label.setScale(1 / this.pixelScale);
  }

  private makeLabel(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    const label = this.add
      .text(x, y, text, { fontFamily: 'sans-serif', fontSize: `${LABEL_FONT_PX}px`, color, resolution: 2 })
      .setScale(1 / this.pixelScale)
      .setDepth(DEPTH.label);
    this.labels.push(label);
    label.once(Phaser.GameObjects.Events.DESTROY, () => (this.labels = this.labels.filter((l) => l !== label)));
    return label;
  }
}

/** 광장 물건 기준점(바닥 가운데 타일)의 월드 좌표 */
function spotXY(spot: Spot): [number, number] {
  return [(spot.col + 0.5) * T, (spot.row + 1) * T];
}

function characterKey(id: string): string {
  return `char-${id}`;
}

function shorten(title: string, max = 10): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}
