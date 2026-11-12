import { describe, expect, it } from 'vitest';
import { RoomView, type RoomBackend, type Room } from './rooms';

const room: Room = { id: 'r1', name: '캡스톤 팀', inviteCode: 'ABC123', ownerId: 'me' };

/** 실제 서버 없이 방 화면 상태만 확인하는 가짜 백엔드 */
function stubBackend(rooms: Room[]): RoomBackend {
  return {
    me: { id: 'me', nickname: '나' },
    listRooms: async () => rooms,
    createRoom: async (name) => ({ ...room, id: 'r2', name }),
    joinRoom: async () => room,
    leaveRoom: async () => {},
    loadMembers: async () => [{ userId: 'me', nickname: '나', save: null }, { userId: 'f1', nickname: '지우', save: null }],
    loadSlots: async () => [],
    addTask: async () => {},
    completeTask: async () => {},
    deleteTask: async () => {},
    enter: async () => () => {},
    setFocus: () => {},
    refreshMe: () => {},
    ringBell: () => {},
  };
}

describe('내 집과 방 마을', () => {
  it('접속하면 방이 있어도 내 집에서 시작해요 (방 연결은 이어져 있어요)', async () => {
    const view = new RoomView();
    await view.connect(stubBackend([room]));
    expect(view.state.active?.id).toBe('r1');
    expect(view.state.inVillage).toBe(false);
  });

  it('방 마을로 갔다가 내 집으로 돌아올 수 있어요', async () => {
    const view = new RoomView();
    await view.connect(stubBackend([room]));
    view.enterVillage();
    expect(view.state.inVillage).toBe(true);
    view.goHome();
    expect(view.state.inVillage).toBe(false);
  });

  it('방이 없으면 마을로 갈 수 없어요', async () => {
    const view = new RoomView();
    await view.connect(stubBackend([]));
    view.enterVillage();
    expect(view.state.inVillage).toBe(false);
  });

  it('방을 새로 만들거나 초대 코드로 들어가면 바로 그 방 마을로 가요', async () => {
    const view = new RoomView();
    await view.connect(stubBackend([]));
    await view.join('ABC123');
    expect(view.state.inVillage).toBe(true);
  });

  it('방에서 나가면 내 집으로 돌아와요', async () => {
    const view = new RoomView();
    await view.connect(stubBackend([room]));
    view.enterVillage();
    await view.leave();
    expect(view.state.inVillage).toBe(false);
  });
});
