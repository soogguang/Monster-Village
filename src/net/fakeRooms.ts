// 개발용 가짜 방 (Supabase 없이 화면 확인용)
// 개발 서버에서 주소 끝에 ?demo-room 을 붙이면 켜져요. 배포 버전에는 들어가지 않아요.

import type { GameState } from '../store';
import type { Presence, Room, RoomBackend, RoomEvents, RoomMember, RoomTask } from './rooms';

const DAY = 24 * 60 * 60 * 1000;

function friendSave(species: string[]): Partial<GameState> {
  const now = Date.now();
  return {
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
    { userId: 'f1', nickname: '지우', focusingOn: '알고리즘 과제' },
    { userId: 'f2', nickname: '민준', focusingOn: null },
  ];
  private myFocus: string | null = null;

  async listRooms() { return [this.room]; }
  async createRoom(name: string) { return { ...this.room, name }; }
  async joinRoom() { return this.room; }
  async leaveRoom() {}
  async loadMembers(): Promise<RoomMember[]> {
    return [
      { userId: 'me', nickname: '나', save: null },
      { userId: 'f1', nickname: '지우', save: friendSave(['sprout-cat', 'sprout-rabbit']) },
      { userId: 'f2', nickname: '민준', save: friendSave(['sprout-mandu', 'sprout-puppy', 'sprout-cat']) },
      { userId: 'f3', nickname: '서연', save: friendSave([]) },
    ];
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
    return () => window.clearTimeout(timer);
  }
  setFocus(focusingOn: string | null) {
    if (focusingOn === this.myFocus) return;
    this.myFocus = focusingOn;
    this.emitPresence();
  }
  ringBell() {}
  private emitPresence() {
    this.events?.onPresence([{ userId: 'me', nickname: '나', focusingOn: this.myFocus }, ...this.online]);
  }
}
