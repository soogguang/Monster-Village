// 동네 화면
// - 내 집: 접속하면 내 마당 하나와 둘레 숲만 보여요.
// - 방 마을(방 창에서 들어가요): 방 멤버마다 마당과 집 (처음에는 좌우, 6명부터 광장을 둘러싸며 늘어나요)
//   아래쪽에 큰길과 광장 (수호나무 = 공동 할 일, 모닥불 = 같이 집중, 응원의 종). 내 집을 누르면 내 집으로 돌아가요.
// 화면은 저장소(GameStore)와 방 상태(roomView)를 그대로 그리기만 해요.

import Phaser from 'phaser';
import { AVATARS, AVATAR_FRAME, AVATAR_ROWS, avatarRow, avatarTexture, avatarWalk, facingForMovement, type Facing } from '../avatars';
import { FRIENDSHIP, RESIDENT_DISPLAY_SCALE, TILE_SIZE, pickPixelScale } from '../config';
import { roomView, type RoomViewState } from '../net/rooms';
import { doughStage, isStuckGrumpy, type DoughStage, type Task } from '../rules/task';
import type { GameState, GameStore, Resident } from '../store';
import { buildTiles, createHomeLayout, createVillageLayout, withMinWidth, type Rect, type Spot, type VillageLayout, type YardPlan } from '../world/layout';
import { MEADOW_TILES, grassTileAt, villageDecor, worldBlocks } from '../world/decor';
import { LANDMARK_TEXT, canInteract, landmarkTargets, nearbyLandmark, type LandmarkId, type LandmarkTarget, type VillageActions } from '../world/interactions';
import { makePlaceholderTextures } from './textures';
import {
  FLOWER_GIFTERS, FLOWER_LIFETIME_MS, MAX_FLOWERS_PER_YARD, SEASON_FLOWERS,
  residentActionImages, residentActionPose, residentWalkPose, seasonFlower,
} from './residentMotion';

const T = TILE_SIZE;
/** 초당 이동 거리 (타일 5.6칸) */
const PLAYER_SPEED = T * 5.6;
/** 이름표는 픽셀 배율과 상관없이 이 크기(화면 픽셀)로 또렷하게 그려요. */
const LABEL_FONT_PX = 13;
/** 맵의 최소 폭(타일). 이보다 좁으면 양옆에 풀밭을 깔아요 */
const MIN_WORLD_COLS = 72;
/** 로그인하지 않았을 때 내 마당의 주인 이름 */
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

interface ResidentMotion {
  sprite: Phaser.GameObjects.Image;
  yard: YardPlan;
  rng: Phaser.Math.RandomDataGenerator;
  isFriend: () => boolean;
  speciesId: string | null;
  baseTexture: string;
  /** held: 별마녀냥에게 꽃을 받는 동안 하던 일을 멈추고 정면으로 서서 기다려요 */
  phase: 'wait' | 'walk' | 'action' | 'held';
  startedAt: number;
  duration: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  actionNext: boolean;
  greet: boolean;
  /** 꽃을 피워 줄 친구(별마녀냥). 그 친구 옆으로 걸어가는 중이거나 꽃을 피우는 중이에요 */
  giftTarget: ResidentMotion | null;
  /** 이번 동작에서 꽃을 이미 피웠는지 */
  bloomed: boolean;
}

export class VillageScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private playerFacing: Facing = 'down';
  private keys!: MoveKeys;
  private interactionKey!: Phaser.Input.Keyboard.Key;
  private landmarks: LandmarkTarget[] = [];
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
  private residentMotions = new Map<Phaser.GameObjects.Image, ResidentMotion>();
  /** 별마녀냥이 피운 꽃 (마당마다 최대 MAX_FLOWERS_PER_YARD송이, 잠시 뒤 사라져요) */
  private giftFlowers = new Map<YardPlan, Phaser.GameObjects.Image[]>();
  /** 주민별 친밀도 (♥가 오르면 하트를 띄우고, 친해진 주민은 가끔 인사하러 와요) */
  private residentHearts = new Map<string, number>();
  private yardSigns = new Map<string, Phaser.GameObjects.Text>();
  /** 친구 마당마다 지금 그려 둔 주민 그림 */
  private friendYards = new Map<string, { key: string; sprites: Phaser.GameObjects.Image[] }>();
  // 광장 물건 (방 마을에서만 있어요)
  private campfire: Phaser.GameObjects.Sprite | null = null;
  private campfireLabel: Phaser.GameObjects.Text | null = null;
  private treeLabel: Phaser.GameObjects.Text | null = null;

  constructor(
    private store: GameStore,
    private characterDir: string,
    private worldAssets: WorldAsset[],
    private hud: VillageActions,
  ) {
    super('village');
  }

  /** 캐릭터(catalog.json)와 배경(village-assets.json) 그림을 불러와요. 없는 파일은 임시 그림으로 대신해요. */
  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      console.warn(`[그림] ${file.url} 을(를) 불러오지 못했어요. 임시 그림으로 보여줄게요.`),
    );
    for (const c of this.store.getCatalog()) {
      this.load.image(characterKey(c.id), `${this.characterDir}${c.image}`);
      for (const image of residentActionImages(c.id)) {
        if (image !== c.id) this.load.image(characterKey(image), `${this.characterDir}${image}.png`);
      }
    }
    for (const flower of SEASON_FLOWERS) this.load.image(characterKey(flower), `${this.characterDir}${flower}.png`);
    for (const a of this.worldAssets) this.load.image(a.key, a.url);
    for (const avatar of AVATARS) this.load.spritesheet(avatarTexture(avatar.id), `${this.characterDir}avatars/${avatar.id}-walk.png`, {
      frameWidth: AVATAR_FRAME.width, frameHeight: AVATAR_FRAME.height,
    });
  }

  create(): void {
    makePlaceholderTextures(this);
    this.buildTerrainTileset();
    this.anims.create({ key: 'campfire-burn', frames: [{ key: 'campfire-01' }, { key: 'campfire-02' }], frameRate: 4, repeat: -1 });
    this.blockers = this.physics.add.staticGroup();

    for (const avatar of AVATARS) {
      const texture = avatarTexture(avatar.id);
      if (!this.textures.exists(texture)) continue;
      for (const row of Object.values(AVATAR_ROWS)) {
        const key = avatarWalk(avatar.id, row);
        if (!this.anims.exists(key)) this.anims.create({
          key, frames: this.anims.generateFrameNumbers(texture, { start: row * AVATAR_FRAME.columns + 1, end: row * AVATAR_FRAME.columns + 4 }),
          frameRate: 8, repeat: -1,
        });
      }
    }
    const texture = avatarTexture(this.store.get().avatarId);
    this.player = this.add.sprite(0, 0, this.textures.exists(texture) ? texture : 'player', 0).setOrigin(0.5, 1);
    this.physics.add.existing(this.player);
    // 발밑만 부딪히게 해요.
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true).setSize(T * 0.75, T * 0.375).setOffset(
      (this.player.width - T * 0.75) / 2,
      this.player.height - T * 0.5,
    );
    this.physics.add.collider(this.player, this.blockers);

    const cam = this.cameras.main;
    // 주민 앞쪽으로 시야를 조금 더 열어 큰 집과 정원이 처음 화면에도 보여요.
    cam.startFollow(this.player, true, 0.15, 0.15, 0, T * 2);
    this.applyPixelScale();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyPixelScale());

    // 입력창에 글자를 칠 때 W·A·S·D가 막히지 않도록 키를 가로채지 않아요.
    const kb = this.input.keyboard!;
    const key = (k: string) => kb.addKey(k, false);
    // 게임 화면에서는 우클릭 메뉴를 띄우지 않아요. 메뉴가 뜨면 키에서 손을 뗀 신호가 사라져서 캐릭터가 계속 걸어가요.
    this.input.mouse?.disableContextMenu();
    // 그래도 키를 뗀 신호를 놓칠 수 있는 순간(다른 창·탭으로 이동, 메뉴)에는 눌린 키를 모두 놓은 것으로 돌려요.
    const releaseKeys = () => kb.resetKeys();
    window.addEventListener('blur', releaseKeys);
    window.addEventListener('contextmenu', releaseKeys);
    document.addEventListener('visibilitychange', releaseKeys);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', releaseKeys);
      window.removeEventListener('contextmenu', releaseKeys);
      document.removeEventListener('visibilitychange', releaseKeys);
    });
    this.keys = { up: key('UP'), down: key('DOWN'), left: key('LEFT'), right: key('RIGHT'), w: key('W'), a: key('A'), s: key('S'), d: key('D') };
    this.interactionKey = key('E');

    this.refreshLayout();
    const unsubscribeRoom = roomView.subscribe((rs) => {
      this.refreshLayout();
      this.renderRoom(rs);
    });
    const unsubscribe = this.store.subscribe((s) => this.render(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { unsubscribeRoom(); unsubscribe(); this.hud.setNearby(null); });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.render(this.store.get()) });
  }

  update(): void {
    this.updateResidentMotions(this.time.now);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // 입력창에 글자를 치거나 창이 열려 있으면 캐릭터가 움직이지 않아요.
    const active = document.activeElement;
    const typing = document.body.dataset.modal === 'open' || (active instanceof HTMLElement && (active.matches('input, select, textarea') || active.isContentEditable));
    // 창이나 입력칸에서 누른 E가 나중에 사물을 여는 일은 없도록 매 프레임 소비해요.
    const pressed = Phaser.Input.Keyboard.JustDown(this.interactionKey);
    const k = this.keys;
    const dx = typing ? 0 : Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const dy = typing ? 0 : Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(PLAYER_SPEED);
    body.setVelocity(v.x, v.y);
    this.playerFacing = facingForMovement(this.playerFacing, dx, dy);
    // 벽에 막혀 실제로 갈 수 없는 방향으로 누를 때는 발도 멈춰요.
    const moving = (dx < 0 && !body.blocked.left) || (dx > 0 && !body.blocked.right)
      || (dy < 0 && !body.blocked.up) || (dy > 0 && !body.blocked.down);
    this.updatePlayerAppearance(moving);
    this.player.setDepth(this.player.y);
    const nearby = typing ? null : nearbyLandmark({ col: this.player.x / T, row: this.player.y / T }, this.landmarks);
    this.hud.setNearby(nearby?.id ?? null);
    if (pressed && nearby && !this.interactionKey.ctrlKey && !this.interactionKey.metaKey && !this.interactionKey.altKey) {
      body.setVelocity(0, 0);
      this.hud.interact(nearby.id);
    }
  }

  private updatePlayerAppearance(moving: boolean): void {
    const id = this.store.get().avatarId;
    const texture = avatarTexture(id);
    const row = avatarRow(this.playerFacing);
    this.player.setFlipX(this.playerFacing === 'left');
    if (!this.textures.exists(texture)) {
      this.player.anims.stop();
      this.player.setTexture(this.playerFacing === 'up' && this.textures.exists('player-back') ? 'player-back' : 'player');
      return;
    }
    if (this.player.texture.key !== texture) {
      this.player.anims.stop();
      this.player.setTexture(texture);
    }
    if (moving) this.player.play(avatarWalk(id, row), true);
    else {
      this.player.anims.stop();
      this.player.setTexture(texture, row * AVATAR_FRAME.columns);
    }
  }

  // ---------------------------------------------------------------- 마을 짓기

  /**
   * 내 집인지 방 마을인지, 방 멤버와 자리 배정으로 배치를 정하고, 바뀌었을 때만 다시 지어요.
   * 방 마을은 방 창에서 [이 방 마을로 가기]를 눌렀을 때만 그려요.
   */
  private refreshLayout(): void {
    const rs = roomView.state;
    const inVillage = rs.inVillage && rs.active !== null && rs.members.length > 0 && rs.backend !== null;
    // 로그인했으면 내 집도 내 아이디로 그려서, 방 마을의 내 마당과 정원 테마가 같아요.
    const myId = rs.backend?.me.id ?? SOLO_ID;
    // 노트북(1배)에서도 화면이 맵보다 넓지 않게 최소 72칸(2,304px) 폭을 보장해요.
    // 아래쪽에는 버튼 줄에 광장이 가리지 않도록 풀밭 몇 줄을 더 깔아요.
    const base = inVillage ? createVillageLayout(rs.members.map((m) => m.userId), rs.slots) : createHomeLayout(myId);
    const layout = withMinWidth(base, MIN_WORLD_COLS, 4);
    const key = JSON.stringify([inVillage, myId, layout.assignments]);
    if (key === this.layoutKey) return;
    const placeChanged = this.layout?.hasPlaza !== layout.hasPlaza;
    const myYardBefore = this.myYard?.rect;
    this.layoutKey = key;
    this.layout = layout;
    this.myYard = layout.yards.find((y) => y.userId === myId)!;
    this.buildWorld();
    // 처음이거나, 집 ↔ 마을을 오갔거나, 내 마당 위치가 바뀌었으면 내 마당 문 앞에서 시작해요.
    if (placeChanged || !myYardBefore || myYardBefore.col !== this.myYard.rect.col || myYardBefore.row !== this.myYard.rect.row) {
      const g = this.myYard.gate;
      this.player.setPosition((g.col + g.cols / 2) * T, (g.row - 5) * T);
    }
    this.render(this.store.get());
    this.renderRoom(rs);
  }

  private buildWorld(): void {
    this.destroyWorld();
    this.landmarks = landmarkTargets(this.layout, this.myYard);
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
      if (this.textures.exists(yard.house.texture)) {
        const house = this.add.image(x, y, yard.house.texture).setOrigin(0.5, 1).setDepth(y);
        // 방 마을에서는 내 집을 눌러 내 집으로 돌아가요.
        if (this.layout.hasPlaza && yard === this.myYard) this.enableLandmark(house, 'home');
        things.push(house);
      }
      const sign = this.makeLabel((yard.gate.col + yard.gate.cols / 2) * T, (yard.gate.row + 1) * T + 4, '', '#ffffff')
        .setOrigin(0.5, 0).setBackgroundColor('#2b2433cc').setPadding(6, 2, 6, 2);
      things.push(sign);
      this.yardSigns.set(yard.userId, sign);
    }

    // 꾸미기 장식: 나무·관목·꽃·생활 소품. 꽃과 풀은 지나갈 수 있고, 나머지는 발밑만 막아요.
    const decorations = villageDecor(this.layout);
    for (const d of decorations) {
      if (!this.textures.exists(d.key)) continue;
      const x = d.x * T;
      const y = d.y * T;
      things.push(this.add.image(x, y, d.key).setOrigin(0.5, 1).setDepth(d.layer === 'ground' ? DEPTH.flatDecor : y));
    }

    // 광장(방 마을에서만): 수호나무(공동 할 일), 모닥불(같이 집중), 응원의 종
    if (this.layout.hasPlaza) {
      const { guardianTree, campfire, bell } = this.layout.anchors;
      const tree = this.placeObject(guardianTree, 'pledge-tree');
      this.enableLandmark(tree, 'tree');
      this.treeLabel = this.plazaLabel(tree.x, tree.y + 4, '수호나무');

      this.campfire = this.add.sprite(...spotXY(campfire), 'campfire-01').setOrigin(0.5, 1).play('campfire-burn');
      this.campfire.setDepth(this.campfire.y);
      this.enableLandmark(this.campfire, 'campfire');
      this.campfireLabel = this.plazaLabel(this.campfire.x, this.campfire.y + 4, '모닥불');

      const bellObj = this.placeObject(bell, 'bell');
      this.enableLandmark(bellObj, 'bell');
      const bellLabel = this.plazaLabel(bellObj.x, bellObj.y + 4, '응원의 종');
      things.push(tree, this.campfire, bellObj, this.treeLabel, this.campfireLabel, bellLabel);
    }

    for (const area of worldBlocks(this.layout, decorations)) {
      this.block((area.col + area.cols / 2) * T, (area.row + area.rows / 2) * T, area.cols * T, area.rows * T);
    }

    // 이동 범위와 카메라
    const w = bounds.cols * T;
    const h = bounds.rows * T;
    this.physics.world.setBounds(bounds.col * T, bounds.row * T, w, h);
    this.cameras.main.setBounds(bounds.col * T, bounds.row * T, w, h);
    this.applyPixelScale();

    this.world = { map, things, colliders };
  }

  private destroyWorld(): void {
    this.hud.setNearby(null);
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
    this.residentMotions.clear();
    for (const list of this.giftFlowers.values()) for (const f of list) { this.tweens.killTweensOf(f); f.destroy(); }
    this.giftFlowers.clear();
    this.yardSigns.clear();
    this.campfire = this.campfireLabel = this.treeLabel = null;
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

  /** 그림의 투명 여백은 클릭에서 빼고, 가까이 다가왔을 때만 기능을 열어요. */
  private enableLandmark(sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, id: LandmarkId): void {
    sprite.setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
    sprite.on('pointerdown', () => {
      if (document.body.dataset.modal === 'open') return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const target = this.landmarks.find((candidate) => candidate.id === id);
      if (!target || !canInteract({ col: this.player.x / T, row: this.player.y / T }, target)) {
        this.hud.notify(`${LANDMARK_TEXT[id].name} 가까이 다가가 주세요.`);
        return;
      }
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.hud.interact(id);
    });
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
      const columns = [0.32, 0.4, 0.65, 0.73];
      const rows = Math.ceil(active.length / columns.length);
      const { x, y } = this.yardSpot(this.myYard, columns[i % columns.length], 0.65 + (Math.floor(i / columns.length) / Math.max(1, rows - 1)) * 0.22);
      const view = this.doughViews.get(task.id) ?? this.addDough(task, x, y);
      view.sprite.setPosition(x, y).setDepth(y);
      view.label.setPosition(x, y + 4);
      view.zzz.setPosition(x + T * 0.6, y - T * 2);
      const stage = doughStage(task, now);
      const sleepy = state.focus?.taskId === task.id;
      const awakeTexture = `dough-${stage}`;
      const sleepTexture = `${awakeTexture}-sleep`;
      view.sprite.setTexture(sleepy && this.textures.exists(sleepTexture) ? sleepTexture : awakeTexture);
      view.zzz.setVisible(sleepy);
      view.label.setText(`${shorten(task.title)}\n${sleepy ? '졸림' : stage === 'grumpy' && isStuckGrumpy(task, now) ? '굳은 심술' : STAGE_LABELS[stage]}`);
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

  private addDough(task: Task, x: number, y: number): DoughView {
    // 큰 집 앞 테라스 아래, 가운데 길 양옆의 활동 공간에 놓아요.
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
    const home = this.yardSpot(yard, rng.realInRange(0.31, 0.74), rng.realInRange(0.82, 0.94));
    const placeholder = r.kind === 'sprout' && r.rare ? 'resident-sprout-rare' : `resident-${r.kind}`;
    const key = r.speciesId && this.textures.exists(characterKey(r.speciesId)) ? characterKey(r.speciesId) : placeholder;
    // 고양이·강아지처럼 그림이 큰 주민은 화면에서만 줄여 그려요. (발밑 기준이라 서 있는 자리는 그대로)
    const scale = (r.speciesId && RESIDENT_DISPLAY_SCALE[r.speciesId]) || 1;
    const sprite = this.add.image(home.x, home.y, key).setOrigin(0.5, 1).setDepth(home.y).setScale(scale);
    if (bornNow && this.time.now > 2000) {
      sprite.setScale(0);
      this.tweens.add({ targets: sprite, scale, duration: 500, ease: 'Back.Out' });
    }
    const ground = { x: Math.round(home.x), y: Math.round(home.y) };
    sprite.setPosition(ground.x, ground.y).setDepth(ground.y);
    this.residentMotions.set(sprite, {
      sprite, yard, rng, isFriend, speciesId: r.speciesId ?? null, baseTexture: key,
      phase: 'wait', startedAt: this.time.now, duration: rng.between(1200, 3000),
      from: ground, to: ground, actionNext: true, greet: false, giftTarget: null, bloomed: true,
    });
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => this.residentMotions.delete(sprite));
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
  private startResidentWalk(motion: ResidentMotion, now: number): void {
    const { sprite, yard, rng, isFriend } = motion;
    const greet = isFriend() && this.playerInYard(yard) && rng.frac() < 0.35;
    const next = greet
      ? { x: this.player.x + (rng.frac() < 0.5 ? -1 : 1) * T * 1.5, y: this.player.y + T * 0.25 }
      : this.yardSpot(yard, rng.realInRange(0.31, 0.74), rng.realInRange(0.82, 0.94));
    motion.from = { ...motion.to };
    motion.to = { x: Math.round(next.x), y: Math.round(next.y) };
    motion.duration = Math.max(320, Phaser.Math.Distance.Between(motion.from.x, motion.from.y, motion.to.x, motion.to.y) / T * 960);
    motion.startedAt = now;
    motion.phase = 'walk';
    motion.greet = greet;
    motion.actionNext = true;
    sprite.setTexture(motion.baseTexture);
  }

  /** 꽃을 받을 주민은 하던 걷기·쉬는 동작을 멈추고 그 자리에 정면으로 서서 기다려요. */
  private holdResident(target: ResidentMotion, now: number): void {
    if (target.giftTarget) this.releaseResident(target.giftTarget, now);
    if (target.phase === 'walk') {
      const pose = residentWalkPose(target.from, target.to, now - target.startedAt, target.duration);
      target.to = { x: pose.x, y: pose.groundY };
    }
    target.phase = 'held';
    target.greet = false;
    target.giftTarget = null;
    target.sprite.setTexture(target.baseTexture).setPosition(target.to.x, target.to.y).setDepth(target.to.y);
  }

  private releaseResident(target: ResidentMotion, now: number): void {
    if (target.phase === 'held') this.waitResident(target, now);
  }

  /** 별마녀냥: 꽃을 피워 줄 친구를 세워 두고, 그 친구 오른쪽 옆으로 걸어가요. (마법봉이 왼쪽 아래를 향해요) */
  private startGiftWalk(motion: ResidentMotion, target: ResidentMotion, now: number): void {
    this.holdResident(target, now);
    motion.from = { ...motion.to };
    motion.to = { x: Math.round(target.to.x + T * 1.25), y: Math.round(target.to.y) };
    motion.duration = Math.max(320, Phaser.Math.Distance.Between(motion.from.x, motion.from.y, motion.to.x, motion.to.y) / T * 960);
    motion.startedAt = now;
    motion.phase = 'walk';
    motion.greet = false;
    motion.giftTarget = target;
    motion.sprite.setTexture(motion.baseTexture);
  }

  private startResidentAction(motion: ResidentMotion, now: number): void {
    motion.phase = 'action';
    motion.startedAt = now;
    motion.actionNext = false;
    motion.bloomed = false;
  }

  /** 마법봉 끝 아래, 친구 발치에 계절 꽃이 피어나요. 별빛 몇 개가 반짝이고, 10초 뒤(마지막 2초 동안 서서히) 사라져요. */
  private bloomFlower(motion: ResidentMotion): void {
    const key = characterKey(seasonFlower(new Date()));
    if (!this.textures.exists(key)) return;
    const target = motion.giftTarget && this.residentMotions.has(motion.giftTarget.sprite) ? motion.giftTarget : null;
    const x = target ? Math.round(target.sprite.x + 12) : motion.to.x - 16;
    const y = (target ? (target.phase === 'walk' ? Math.round(target.sprite.y) : target.to.y) : motion.to.y) + 3;
    const flower = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y - 1).setScale(0);
    this.tweens.add({ targets: flower, scale: 1, duration: 350, ease: 'Back.Out' });
    for (let i = 0; i < 3; i++) {
      const star = this.add.rectangle(x + (i - 1) * 6, y - 12 - (i % 2) * 4, 2, 2, 0xf8cc5e).setDepth(y + 1);
      this.tweens.add({ targets: star, y: star.y - 8, alpha: 0, duration: 700, delay: i * 90, onComplete: () => star.destroy() });
    }
    const list = this.giftFlowers.get(motion.yard) ?? [];
    list.push(flower);
    while (list.length > MAX_FLOWERS_PER_YARD) { const old = list.shift()!; this.tweens.killTweensOf(old); old.destroy(); }
    this.giftFlowers.set(motion.yard, list);
    this.time.delayedCall(FLOWER_LIFETIME_MS - 2000, () => {
      if (!flower.active) return;
      this.tweens.add({ targets: flower, alpha: 0, duration: 2000, onComplete: () => {
        const i = list.indexOf(flower);
        if (i >= 0) list.splice(i, 1);
        flower.destroy();
      } });
    });
  }

  private waitResident(motion: ResidentMotion, now: number): void {
    motion.sprite.setTexture(motion.baseTexture).setPosition(motion.to.x, motion.to.y).setDepth(motion.to.y);
    motion.phase = 'wait';
    motion.startedAt = now;
    motion.duration = motion.rng.between(800, 3000);
  }

  private updateResidentMotions(now: number): void {
    for (const motion of this.residentMotions.values()) {
      const { sprite } = motion;
      const elapsed = now - motion.startedAt;
      if (motion.phase === 'walk') {
        const pose = residentWalkPose(motion.from, motion.to, elapsed, motion.duration);
        sprite.setPosition(pose.x, pose.y).setDepth(pose.groundY);
        if (pose.done) {
          if (motion.greet) this.popHeart(sprite);
          if (motion.giftTarget) this.startResidentAction(motion, now);
          else this.waitResident(motion, now);
        }
      } else if (motion.phase === 'action') {
        const gifter = motion.speciesId ? FLOWER_GIFTERS[motion.speciesId] : undefined;
        if (gifter && !motion.bloomed && elapsed >= gifter.bloomAt) {
          motion.bloomed = true;
          this.bloomFlower(motion);
        }
        // 마법봉 동작이 끝나면 세워 둔 친구가 다시 움직여요
        if (gifter && motion.giftTarget && elapsed >= gifter.holdUntil) {
          this.releaseResident(motion.giftTarget, now);
          motion.giftTarget = null;
        }
        const pose = residentActionPose(motion.speciesId, elapsed);
        if (!pose) {
          if (motion.giftTarget) this.releaseResident(motion.giftTarget, now);
          motion.giftTarget = null;
          this.waitResident(motion, now);
        }
        else {
          const key = characterKey(pose.image);
          sprite.setTexture(this.textures.exists(key) ? key : motion.baseTexture);
          sprite.setPosition(motion.to.x, motion.to.y - pose.lift).setDepth(motion.to.y);
        }
      } else if (motion.phase === 'held') {
        // 꽃을 받는 중: 정면으로 서서 기다려요 (별마녀냥이 풀어 줄 때까지)
      } else if (elapsed >= motion.duration) {
        const images = residentActionImages(motion.speciesId);
        if (motion.actionNext && images.some((image) => this.textures.exists(characterKey(image)))) {
          // 별마녀냥은 같은 마당의 다른 주민에게 먼저 걸어가서 꽃을 피워 줘요. (혼자면 제자리에서 피워요)
          const friends = motion.speciesId && FLOWER_GIFTERS[motion.speciesId]
            ? [...this.residentMotions.values()].filter((m) => m !== motion && m.yard === motion.yard)
            : [];
          if (friends.length) this.startGiftWalk(motion, motion.rng.pick(friends), now);
          else this.startResidentAction(motion, now);
        } else this.startResidentWalk(motion, now);
      }
      // 정면 한 장을 좌우로 뒤집으면 비대칭 얼굴의 눈이 옆으로 튀어요.
      // 주민은 정면을 유지하고, 이동은 위치와 0~2px 높이 변화로 표현해요.
    }
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
      if (yard === this.myYard) { sign?.setText(this.layout.hasPlaza ? '내 마당' : '우리 집'); continue; }
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

    if (!this.campfire || !this.campfireLabel || !this.treeLabel) return;
    const focusing = roomView.focusingCount();
    // 192×192 모닥불은 최대 1.4배. 좌석은 가장 커졌을 때도 바깥에 놓아요.
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
