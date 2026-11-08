// 친구와 함께하는 방(동네)
// - 방 목록, 만들기, 초대 코드로 들어가기, 나가기
// - 방 멤버와 그들의 마당(게임 데이터) 구경
// - 나무에 걸린 공동 할 일 (room_tasks 표, 실시간 반영)
// - 접속·집중 상태 (실시간 presence)와 응원의 종 (실시간 broadcast): 저장하지 않아요
//
// 화면 코드는 RoomBackend 인터페이스만 알아요. 진짜 구현은 Supabase, 개발용 가짜 구현은 fakeRooms.ts예요.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../store';
import type { SlotAssignment } from '../world/layout';

export interface Room {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
}

export interface RoomMember {
  userId: string;
  nickname: string;
  /** 그 친구의 게임 데이터 (주민 구경용). 아직 저장한 적이 없으면 null */
  save: Partial<GameState> | null;
}

export interface RoomTask {
  id: string;
  title: string;
  dueAt: number | null;
  createdBy: string;
  doneBy: string | null;
  doneAt: number | null;
  createdAt: number;
}

export interface Presence {
  userId: string;
  nickname: string;
  /** 지금 집중 중인 할 일 제목. 집중 중이 아니면 null */
  focusingOn: string | null;
}

export interface RoomEvents {
  onTasks(tasks: RoomTask[]): void;
  onPresence(online: Presence[]): void;
  onBell(from: string, to: string): void;
}

export interface RoomBackend {
  me: { id: string; nickname: string };
  listRooms(): Promise<Room[]>;
  createRoom(name: string): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  leaveRoom(roomId: string): Promise<void>;
  loadMembers(roomId: string): Promise<RoomMember[]>;
  /** 방의 마당 자리 배정 (나간 멤버의 자리도 포함). 모든 멤버가 같은 배정을 봐요 */
  loadSlots(roomId: string): Promise<SlotAssignment[]>;
  addTask(roomId: string, title: string, dueAt: number | null): Promise<void>;
  completeTask(taskId: string): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  /** 방에 들어가서 실시간으로 이어져요. 반환하는 함수를 부르면 연결을 끊어요. */
  enter(roomId: string, events: RoomEvents): Promise<() => void>;
  setFocus(focusingOn: string | null): void;
  /** 내 이름(me.nickname)이 바뀌었을 때 접속 상태를 다시 보내요 */
  refreshMe(): void;
  ringBell(toUserId: string): void;
}

// ---------------------------------------------------------------- Supabase 구현

interface RoomRow { id: string; name: string; invite_code: string; owner_id: string }
interface TaskRow { id: string; title: string; due_at: string | null; created_by: string; done_by: string | null; done_at: string | null; created_at: string }

const toRoom = (r: RoomRow): Room => ({ id: r.id, name: r.name, inviteCode: r.invite_code, ownerId: r.owner_id });
const toTask = (r: TaskRow): RoomTask => ({
  id: r.id,
  title: r.title,
  dueAt: r.due_at ? Date.parse(r.due_at) : null,
  createdBy: r.created_by,
  doneBy: r.done_by,
  doneAt: r.done_at ? Date.parse(r.done_at) : null,
  createdAt: Date.parse(r.created_at),
});

export class SupabaseRooms implements RoomBackend {
  private channel: RealtimeChannel | null = null;
  private focusingOn: string | null = null;

  constructor(
    private client: SupabaseClient,
    public me: { id: string; nickname: string },
  ) {}

  async listRooms(): Promise<Room[]> {
    const { data, error } = await this.client.from('rooms').select('id, name, invite_code, owner_id').order('created_at');
    if (error) throw error;
    return (data as RoomRow[]).map(toRoom);
  }

  async createRoom(name: string): Promise<Room> {
    const { data, error } = await this.client.rpc('create_room', { room_name: name });
    if (error) throw error;
    return toRoom(data as RoomRow);
  }

  async joinRoom(code: string): Promise<Room> {
    const { data, error } = await this.client.rpc('join_room', { code });
    if (error) throw error;
    return toRoom(data as RoomRow);
  }

  async leaveRoom(roomId: string): Promise<void> {
    const { error } = await this.client.from('room_members').delete().eq('room_id', roomId).eq('user_id', this.me.id);
    if (error) throw error;
  }

  async loadMembers(roomId: string): Promise<RoomMember[]> {
    const { data: members, error } = await this.client.from('room_members').select('user_id').eq('room_id', roomId).order('joined_at');
    if (error) throw error;
    const ids = (members as { user_id: string }[]).map((m) => m.user_id);
    const [{ data: profiles }, { data: saves }] = await Promise.all([
      this.client.from('profiles').select('id, nickname').in('id', ids),
      this.client.from('game_saves').select('user_id, state').in('user_id', ids),
    ]);
    return ids.map((id) => ({
      userId: id,
      nickname: (profiles as { id: string; nickname: string }[] | null)?.find((p) => p.id === id)?.nickname ?? '주민',
      save: ((saves as { user_id: string; state: Partial<GameState> }[] | null)?.find((s) => s.user_id === id)?.state) ?? null,
    }));
  }

  async loadSlots(roomId: string): Promise<SlotAssignment[]> {
    const { data, error } = await this.client.from('room_slots').select('user_id, slot').eq('room_id', roomId);
    // 0002_room_slots.sql을 아직 실행하지 않았으면 표가 없어요. 그때는 들어온 순서대로 화면에서 정해요.
    if (error) {
      console.warn('[방] 자리 정보를 불러오지 못해서 들어온 순서로 배치해요.', error.message);
      return [];
    }
    return (data as { user_id: string; slot: number }[]).map((r) => ({ userId: r.user_id, slot: r.slot }));
  }

  private async loadTasks(roomId: string): Promise<RoomTask[]> {
    const { data, error } = await this.client
      .from('room_tasks')
      .select('id, title, due_at, created_by, done_by, done_at, created_at')
      .eq('room_id', roomId)
      .order('created_at');
    if (error) throw error;
    return (data as TaskRow[]).map(toTask);
  }

  async addTask(roomId: string, title: string, dueAt: number | null): Promise<void> {
    const { error } = await this.client.from('room_tasks').insert({
      room_id: roomId,
      title: title.trim(),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      created_by: this.me.id,
    });
    if (error) throw error;
  }

  async completeTask(taskId: string): Promise<void> {
    const { error } = await this.client.from('room_tasks').update({ done_by: this.me.id, done_at: new Date().toISOString() }).eq('id', taskId);
    if (error) throw error;
  }

  async deleteTask(taskId: string): Promise<void> {
    const { error } = await this.client.from('room_tasks').delete().eq('id', taskId);
    if (error) throw error;
  }

  async enter(roomId: string, events: RoomEvents): Promise<() => void> {
    const reloadTasks = () => this.loadTasks(roomId).then(events.onTasks).catch((err) => console.warn('[방] 공동 할 일을 불러오지 못했어요.', err));
    await reloadTasks();

    const channel = this.client.channel(`room:${roomId}`, { config: { presence: { key: this.me.id } } });
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_tasks', filter: `room_id=eq.${roomId}` }, reloadTasks)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Presence>();
        events.onPresence(Object.values(state).map((list) => list[0]).filter(Boolean));
      })
      .on('broadcast', { event: 'bell' }, ({ payload }) => events.onBell(payload.from, payload.to))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.track(channel);
      });
    this.channel = channel;
    return () => {
      void this.client.removeChannel(channel);
      if (this.channel === channel) this.channel = null;
    };
  }

  setFocus(focusingOn: string | null): void {
    if (focusingOn === this.focusingOn) return;
    this.focusingOn = focusingOn;
    if (this.channel) void this.track(this.channel);
  }

  refreshMe(): void {
    if (this.channel) void this.track(this.channel);
  }

  ringBell(toUserId: string): void {
    void this.channel?.send({ type: 'broadcast', event: 'bell', payload: { from: this.me.nickname, to: toUserId } });
  }

  private track(channel: RealtimeChannel) {
    const presence: Presence = { userId: this.me.id, nickname: this.me.nickname, focusingOn: this.focusingOn };
    return channel.track(presence);
  }
}

// ---------------------------------------------------------------- 화면이 함께 보는 방 상태

export interface RoomViewState {
  backend: RoomBackend | null;
  rooms: Room[];
  active: Room | null;
  members: RoomMember[];
  slots: SlotAssignment[];
  tasks: RoomTask[];
  online: Presence[];
  /** 방 마을에 들어가 있으면 true, 내 집에 있으면 false. 접속하면 항상 내 집에서 시작해요 */
  inVillage: boolean;
}

const ACTIVE_KEY = 'monster-village:active-room';

/** 방 상태를 한곳에 모아서, 방 창과 마을 화면이 같은 내용을 보게 해요. */
export class RoomView {
  state: RoomViewState = { backend: null, rooms: [], active: null, members: [], slots: [], tasks: [], online: [], inVillage: false };
  private listeners = new Set<(s: RoomViewState) => void>();
  private leaveChannel: (() => void) | null = null;
  /** 누가 나에게 종을 쳤을 때 */
  onBellForMe: (from: string) => void = () => {};

  subscribe(fn: (s: RoomViewState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async connect(backend: RoomBackend): Promise<void> {
    this.patch({ backend });
    await this.refreshRooms();
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(ACTIVE_KEY); } catch { /* 무시 */ }
    const room = this.state.rooms.find((r) => r.id === saved) ?? this.state.rooms[0];
    if (room) await this.open(room);
  }

  async refreshRooms(): Promise<void> {
    if (!this.state.backend) return;
    this.patch({ rooms: await this.state.backend.listRooms() });
  }

  async open(room: Room): Promise<void> {
    const backend = this.state.backend;
    if (!backend) return;
    this.leaveChannel?.();
    try { window.localStorage.setItem(ACTIVE_KEY, room.id); } catch { /* 무시 */ }
    this.patch({ active: room, members: [], slots: [], tasks: [], online: [] });
    const [members, slots] = await Promise.all([backend.loadMembers(room.id), backend.loadSlots(room.id)]);
    this.patch({ members, slots });
    this.leaveChannel = await backend.enter(room.id, {
      onTasks: (tasks) => this.patch({ tasks }),
      onPresence: (online) => { this.patch({ online }); this.refreshMembersSoon(room.id); },
      onBell: (from, to) => { if (to === backend.me.id) this.onBellForMe(from); },
    });
  }

  async create(name: string): Promise<void> {
    const room = await this.state.backend!.createRoom(name);
    await this.refreshRooms();
    await this.open(room);
    this.enterVillage();
  }

  async join(code: string): Promise<void> {
    const room = await this.state.backend!.joinRoom(code);
    await this.refreshRooms();
    await this.open(room);
    this.enterVillage();
  }

  /** 지금 고른 방의 마을로 가요. (방 연결은 집에 있을 때도 계속 이어져 있어요) */
  enterVillage(): void {
    if (this.state.active && !this.state.inVillage) this.patch({ inVillage: true });
  }

  /** 내 집으로 돌아와요. 방 친구들의 상태·종 알림은 계속 받아요. */
  goHome(): void {
    if (this.state.inVillage) this.patch({ inVillage: false });
  }

  async leave(): Promise<void> {
    const { backend, active } = this.state;
    if (!backend || !active) return;
    this.leaveChannel?.();
    this.leaveChannel = null;
    await backend.leaveRoom(active.id);
    this.patch({ active: null, members: [], slots: [], tasks: [], online: [], inVillage: false });
    await this.refreshRooms();
    if (this.state.rooms[0]) await this.open(this.state.rooms[0]);
  }

  /**
   * 친구가 집중을 켜고 끄면(접속 상태가 바뀌면) 잠시 뒤 멤버 데이터를 다시 불러와요.
   * 오늘 집중 시간·마당 주민이 최신이 되도록. 친구 데이터가 저장될 시간을 조금 기다려요.
   */
  private membersTimer: number | undefined;
  private refreshMembersSoon(roomId: string): void {
    window.clearTimeout(this.membersTimer);
    this.membersTimer = window.setTimeout(async () => {
      const backend = this.state.backend;
      if (!backend || this.state.active?.id !== roomId) return;
      try { this.patch({ members: await backend.loadMembers(roomId) }); } catch { /* 다음 변화 때 다시 시도해요 */ }
    }, 3000);
  }

  /** 내 이름을 바꾼 뒤: 멤버 목록과 접속 상태를 새로 고쳐서 방 친구 화면에도 새 이름이 보이게 해요 */
  async renameMe(nickname: string): Promise<void> {
    const { backend, active } = this.state;
    if (!backend) return;
    backend.me.nickname = nickname;
    backend.refreshMe();
    if (active) this.patch({ members: await backend.loadMembers(active.id) });
  }

  /** 나를 뺀 방 친구들 (들어온 순서) */
  friends(): RoomMember[] {
    const me = this.state.backend?.me.id;
    return this.state.members.filter((m) => m.userId !== me);
  }

  focusingCount(): number {
    return this.state.online.filter((p) => p.focusingOn).length;
  }

  private patch(changes: Partial<RoomViewState>): void {
    this.state = { ...this.state, ...changes };
    for (const fn of this.listeners) fn(this.state);
  }
}

export const roomView = new RoomView();
