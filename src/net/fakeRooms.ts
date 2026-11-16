// 개발용 가짜 방 (Supabase 없이 화면 확인용)
// 개발 서버에서 주소 끝에 ?demo-room 을 붙이면 켜져요. 배포 버전에는 들어가지 않아요.
// ?demo-room=13 처럼 숫자를 붙이면 그 인원만큼 친구를 채워서 큰 방 배치를 볼 수 있어요.

import { TILE_SIZE } from '../config';
import type { GameState } from '../store';
import { createVillageLayout } from '../world/layout';
import type { MoveState, MyPresence, Presence, Room, RoomBackend, RoomEvents, RoomMember, RoomTask, TreeTask } from './rooms';

const DAY = 24 * 60 * 60 * 1000;
const BASE_MEMBERS = 4;

/** 주소의 ?demo-room=숫자 (없으면 기본 4명) */
function demoSize(): number {
  const n = Number(new URLSearchParams(window.location.search).get('demo-room'));
  return Number.isInteger(n) && n > BASE_MEMBERS ? Math.min(n, 60) : BASE_MEMBERS;
}
const EXTRA_IDS = Array.from({ length: demoSize() - BASE_MEMBERS }, (_, i) => `f${i + 4}`);

const HOUR = 60 * 60 * 1000;
/** 가짜 친구의 할 일 (마당에 반죽으로 보여요): [제목, 시작(지금부터 몇 시간 전), 마감(지금부터 몇 시간 뒤)] */
type FakeTask = [string, number, number];

/** 가짜 친구 데이터. focusMinutes만큼 오늘 집중한 기록도 넣어요 (방 창의 "오늘 집중 시간" 확인용) */
function friendSave(species: string[], focusMinutes = 0, tasks: FakeTask[] = [], focusOn = -1): Partial<GameState> {
  const now = Date.now();
  const end = Math.max(new Date(now).setHours(0, 0, 0, 0) + focusMinutes * 60 * 1000, now - 60 * 1000);
  return {
    tasks: tasks.map(([title, ago, ahead], i) => ({
      id: `${title}-${i}`, title, startAt: now - ago * HOUR, dueAt: now + ahead * HOUR, focusMinutes: 0, dueExtensions: 0,
    })),
    focus: focusOn >= 0 ? { taskId: `${tasks[focusOn][0]}-${focusOn}`, startedAt: now - 20 * 60 * 1000 } : null,
    sessions: focusMinutes ? [{ taskId: 'demo', startedAt: end - focusMinutes * 60 * 1000, endedAt: end }] : [],
    residents: species.map((speciesId, i) => ({
      id: `${speciesId}-${i}`, kind: 'sprout', rare: false, speciesId, fromTask: '데모', bornAt: now - i * DAY, hearts: 1 + i, visible: true,
    })),
  };
}

export class FakeRooms implements RoomBackend {
  me = { id: 'me', nickname: '나' };
  private room: Room = { id: 'demo', name: '캡스톤 팀', inviteCode: 'ABC123', ownerId: 'me' };
  private tasks: RoomTask[] = [
    { id: 't1', title: '발표 자료 초안', dueAt: Date.now() + 2 * DAY, createdBy: 'f1', doneBy: null, doneAt: null, createdAt: Date.now() - DAY },
    { id: 't2', title: '회의록 정리', dueAt: null, createdBy: 'me', doneBy: 'f2', doneAt: Date.now() - 3600_000, createdAt: Date.now() - DAY },
  ];
  private events: RoomEvents | null = null;
  private online: Presence[] = [
    { userId: 'f1', nickname: '지우', focusingOn: '알고리즘 과제', inVillage: true, avatarId: 'mint' },
    { userId: 'f2', nickname: '민준', focusingOn: '🌳 발표 자료 초안', treeTaskId: 't1', inVillage: true, avatarId: 'lavender' },
  ];
  private my: MyPresence = { focusingOn: null, treeTaskId: null, inVillage: false, avatarId: 'forest' };

  async listRooms() { return [this.room]; }
  async createRoom(name: string) { return { ...this.room, name }; }
  async joinRoom() { return this.room; }
  async leaveRoom() {}
  async loadMembers(): Promise<RoomMember[]> {
    return [
      { userId: 'me', nickname: '나', save: null },
      { userId: 'f1', nickname: '지우', save: friendSave(['sprout-cat', 'sprout-rabbit'], 130, [['알고리즘 과제', 2, 20], ['독서', 30, 2]], 0) },
      { userId: 'f2', nickname: '민준', save: friendSave(['sprout-mandu', 'sprout-puppy', 'sprout-cat'], 45, [['영어 단어', 50, -3]]) },
      { userId: 'f3', nickname: '서연', save: friendSave([]) },
      ...EXTRA_IDS.map((userId, i) => ({ userId, nickname: `친구${i + 4}`, save: friendSave(i % 2 ? ['sprout-cat'] : []) })),
    ];
  }
  async loadSlots() {
    // 늘어난 친구는 자리를 비워 두면 화면이 순서대로 정해요.
    return [{ userId: 'me', slot: 0 }, { userId: 'f1', slot: 1 }, { userId: 'f2', slot: -1 }, { userId: 'f3', slot: 2 }];
  }
  async loadTreeTasks(): Promise<TreeTask[]> {
    return this.tasks.map((t) => ({ ...t, roomId: this.room.id, roomName: this.room.name }));
  }
  async addTask(_roomId: string, title: string, dueAt: number | null) {
    this.tasks = [...this.tasks, { id: crypto.randomUUID(), title, dueAt, createdBy: 'me', doneBy: null, doneAt: null, createdAt: Date.now() }];
    this.events?.onTasks(this.tasks);
  }
  async completeTask(taskId: string) {
    this.tasks = this.tasks.map((t) => (t.id === taskId ? { ...t, doneBy: 'me', doneAt: Date.now() } : t));
    this.events?.onTasks(this.tasks);
  }
  async deleteTask(taskId: string) {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.events?.onTasks(this.tasks);
  }
  async enter(_roomId: string, events: RoomEvents) {
    this.events = events;
    events.onTasks(this.tasks);
    this.emitPresence();
    // 잠시 뒤 친구가 나에게 종을 쳐요 (알림 확인용)
    const timer = window.setTimeout(() => events.onBell('지우', 'me'), 4000);
    const walk = this.walkFriends(events);
    return () => { window.clearTimeout(timer); window.clearInterval(walk); };
  }
  refreshMe() {
    this.emitPresence();
  }
  setPresence(me: MyPresence) {
    if (JSON.stringify(me) === JSON.stringify(this.my)) return;
    this.my = { ...me };
    this.emitPresence();
  }
  sendMove() {}
  ringBell() {}
  private emitPresence() {
    this.events?.onPresence([{ userId: 'me', nickname: this.me.nickname, ...this.my }, ...this.online]);
  }

  /** 지우는 광장을 천천히 돌아다니고, 민준은 수호나무 앞에 서서 나무 할 일에 집중해요 */
  private walkFriends(events: RoomEvents): number {
    const ids = ['me', 'f1', 'f2', 'f3', ...EXTRA_IDS];
    const { anchors } = createVillageLayout(ids, [{ userId: 'me', slot: 0 }, { userId: 'f1', slot: 1 }, { userId: 'f2', slot: -1 }, { userId: 'f3', slot: 2 }]);
    const T = TILE_SIZE;
    const fire = anchors.campfire;
    const points = [[-6, 4], [6, 4], [6, -3], [-6, -3]].map(([dx, dy]) => ({ x: (fire.col + dx) * T, y: (fire.row + dy) * T }));
    const tree = anchors.guardianTree;
    const send = (m: MoveState) => events.onMove(m);
    send({ userId: 'f2', x: (tree.col + 5) * T, y: (tree.row + 1) * T, facing: 'left', moving: false });
    let pos = { ...points[0] };
    let target = 1;
    return window.setInterval(() => {
      const goal = points[target];
      const dx = goal.x - pos.x, dy = goal.y - pos.y;
      const step = T * 0.5;
      const dist = Math.hypot(dx, dy);
      if (dist <= step) { pos = { ...goal }; target = (target + 1) % points.length; }
      else pos = { x: pos.x + (dx / dist) * step, y: pos.y + (dy / dist) * step };
      const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      send({ userId: 'f1', x: pos.x, y: pos.y, facing, moving: true });
    }, 100);
  }
}
