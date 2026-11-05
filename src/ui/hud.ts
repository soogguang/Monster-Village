// 게임 화면 위에 올리는 UI: 왼쪽 위 상태 상자, 아래 버튼 줄, 가운데 창, 알림

import { RULES } from '../config';
import type { HabitId } from '../rules/habits';
import type { CompleteResult, GameStore } from '../store';
import { HABIT_TEXT, RESIDENT_TEXT, escapeHtml, formatClock, formatElapsed, heartsText } from './format';
import { roomView } from '../net/rooms';
import { WINDOWS, type GameWindow, type WindowContext } from './windows';

export function mountHud(store: GameStore, characterDir: string): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <section id="status" class="px-box" aria-label="상태">
      <div class="clock"><span class="date"></span><span class="time"></span></div>
      <div class="presence"><span class="dot"></span><span class="state"></span><span class="timer"></span><span class="task"></span></div>
      <div class="focus-row"></div>
    </section>
    <nav id="toolbar" class="px-box" aria-label="메뉴">
      ${WINDOWS.map((w) => `<button class="px-btn tool" data-window="${w.id}" title="${w.label} (${w.key})"><span class="icon">${w.icon}</span>${w.label}<kbd>${w.key}</kbd></button>`).join('')}
    </nav>
    <div id="modal-backdrop" hidden>
      <section class="window px-box" role="dialog" aria-modal="true">
        <div class="window-title"></div>
        <button class="px-btn small ghost window-close" aria-label="닫기">✕</button>
        <div class="window-body"></div>
      </section>
    </div>
    <p id="toast" class="px-box" hidden></p>`,
  );

  const status = document.getElementById('status')!;
  const backdrop = document.getElementById('modal-backdrop')!;
  const windowBody = backdrop.querySelector<HTMLElement>('.window-body')!;
  const toastEl = document.getElementById('toast')!;
  let openId: string | null = null;
  let unmount: (() => void) | null = null;

  const toast = (text: string) => {
    toastEl.textContent = text;
    toastEl.hidden = false;
    window.clearTimeout(Number(toastEl.dataset.timer));
    toastEl.dataset.timer = String(window.setTimeout(() => (toastEl.hidden = true), 4500));
  };

  const ctx: WindowContext = {
    store,
    characterDir,
    toast,
    completeTask: (taskId) => toast(birthMessage(store.completeTask(taskId))),
    toggleFocus: (taskId) => {
      const unlocks = store.get().focus?.taskId === taskId ? store.stopFocus() : store.startFocus(taskId);
      if (unlocks.length) toast(unlockMessage(unlocks));
    },
  };

  const open = (w: GameWindow) => {
    if (openId === w.id) return close();
    unmount?.();
    openId = w.id;
    backdrop.querySelector('.window-title')!.textContent = `${w.icon} ${w.title}`;
    backdrop.querySelector<HTMLElement>('.window')!.dataset.id = w.id;
    backdrop.hidden = false;
    document.body.dataset.modal = 'open';
    // 창마다 새 칸을 만들어요. 같은 칸을 다시 쓰면 버튼 반응(이벤트)이 겹겹이 쌓여요.
    const content = document.createElement('div');
    windowBody.replaceChildren(content);
    unmount = w.mount(content, ctx);
    windowBody.scrollTop = 0;
    renderToolbar();
  };
  const close = () => {
    unmount?.();
    unmount = null;
    openId = null;
    backdrop.hidden = true;
    windowBody.replaceChildren();
    delete document.body.dataset.modal;
    renderToolbar();
  };
  const renderToolbar = () =>
    document.querySelectorAll<HTMLButtonElement>('#toolbar [data-window]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.window === openId)));

  document.getElementById('toolbar')!.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-window]')?.dataset.window;
    const w = WINDOWS.find((x) => x.id === id);
    if (w) open(w);
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || (e.target as HTMLElement).closest('.window-close')) close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId) return close();
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const w = WINDOWS.find((x) => x.key === e.key.toUpperCase());
    if (w) open(w);
  });

  // ----- 왼쪽 위 상태 상자: 시계, 지금 상태, 집중 시작·끝 -----
  status.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'stop') ctx.toggleFocus(store.get().focus!.taskId);
    if (act === 'start') {
      const id = status.querySelector<HTMLSelectElement>('select')?.value;
      if (id) ctx.toggleFocus(id);
      else open(WINDOWS[0]);
    }
  });

  let lastFocusKey = '';
  const renderStatus = () => {
    const now = Date.now();
    const { date, time } = formatClock(now);
    status.querySelector('.date')!.textContent = date;
    status.querySelector('.time')!.textContent = time;
    const state = store.get();
    const focusTask = state.focus && state.tasks.find((t) => t.id === state.focus!.taskId);
    const presence = status.querySelector('.presence')!;
    presence.classList.toggle('focusing', Boolean(focusTask));
    presence.querySelector('.state')!.textContent = focusTask ? '🔥 집중 중' : '마을에 있어요';
    presence.querySelector('.task')!.textContent = focusTask ? focusTask.title : '';
    presence.querySelector('.timer')!.textContent = focusTask ? formatElapsed(now - state.focus!.startedAt) : '';

    // 고르는 중인 선택지가 사라지지 않도록, 할 일 목록이나 집중 상태가 바뀔 때만 다시 그려요.
    const active = state.tasks.filter((t) => t.completedAt === undefined);
    const key = `${state.focus?.taskId ?? ''}|${active.map((t) => t.id + t.title).join(',')}`;
    if (key === lastFocusKey) return;
    lastFocusKey = key;
    status.querySelector('.focus-row')!.innerHTML = focusTask
      ? '<button class="px-btn red" data-act="stop" style="flex:1">집중 끝내기</button>'
      : active.length
        ? `<select class="px-input">${active.map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('')}</select><button class="px-btn green" data-act="start">🔥 집중</button>`
        : '<button class="px-btn" data-act="start" style="flex:1">할 일 등록하러 가기</button>';
  };
  renderStatus();
  store.subscribe(renderStatus);
  window.setInterval(renderStatus, 1000);

  // ----- 방: 친구가 나에게 종을 치면 알려주고, 내 집중 상태를 방 친구들에게 보여줘요 -----
  roomView.onBellForMe = (from) => toast(`🔔 ${from}님이 응원의 종을 쳤어요! 힘내요!`);
  let sharedFocus: string | null | undefined;
  const shareFocus = () => {
    const s = store.get();
    const title = (s.focus && s.tasks.find((t) => t.id === s.focus!.taskId)?.title) ?? null;
    if (title === sharedFocus && roomView.state.active) return;
    sharedFocus = title;
    roomView.state.backend?.setFocus(title);
  };
  store.subscribe(shareFocus);
  let lastRoomId: string | undefined;
  roomView.subscribe((rs) => {
    // 방에 새로 들어가면 지금 집중 상태를 한 번 알려줘요.
    if (rs.active?.id !== lastRoomId) { lastRoomId = rs.active?.id; sharedFocus = undefined; shareFocus(); }
  });

  // ----- 연결 신호: 창이 열려 있는 동안 30초마다 남겨요 -----
  // 창을 닫았거나 노트북이 잠들어서 5분 넘게 끊겼다면, 집중은 마지막 신호 시각에 끝난 것으로 기록돼요.
  const beat = () => {
    const ended = store.heartbeat();
    if (!ended) return;
    const { time } = formatClock(ended.endedAt);
    let text = `🔌 연결이 끊겨 있어서 집중을 ${time}에 끝난 것으로 기록했어요.`;
    if (ended.newUnlocks.length) text += `\n${unlockMessage(ended.newUnlocks)}`;
    toast(text);
  };
  beat();
  window.setInterval(beat, 30 * 1000);
  document.addEventListener('visibilitychange', beat);
}

function birthMessage({ resident: r, species, newUnlocks, isNew, stageUp }: CompleteResult): string {
  const kind = r.kind === 'sprout' && r.rare ? '✨ 희귀 새싹' : RESIDENT_TEXT[r.kind];
  const name = r.nickname ?? species?.name ?? kind;
  let text = isNew
    ? `"${r.fromTask}"을(를) 끝내서 ${kind} 주민${species ? ` "${species.name}"` : ''}이(가) 마당으로 이사 왔어요!`
    : `"${name}"을(를) 다시 만났어요! 친밀도 ${heartsText(r.hearts)}`;
  if (stageUp === 'friend') text += `\n💕 "${name}"와(과) 친해졌어요! 가끔 인사하러 올 거예요.`;
  if (stageUp === 'evolved') text += `\n🌟 "${name}"이(가) 진화할 만큼 친해졌어요!`;
  if (r.kind === 'sleepy') text += `\n(집중 ${RULES.focusMinutesForSleepy}분 이상 덕분에 개과천선)`;
  if (newUnlocks.length) text += `\n${unlockMessage(newUnlocks)}`;
  return text;
}

function unlockMessage(unlocks: HabitId[]): string {
  return `🔓 ${unlocks.map((id) => HABIT_TEXT[id].name).join(', ')} 달성! 새로운 주민을 만날 수 있어요.`;
}
