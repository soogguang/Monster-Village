// 할 일 패널 (화면 오른쪽)
// 글씨와 입력창은 게임 화면 위에 일반 웹 요소로 올려서 또렷하게 보이게 해요.

import { HABITS, RULES } from '../config';
import { HABIT_IDS, type HabitId } from '../rules/habits';
import { doughStage, progressRatio, type DoughStage, type ResidentKind } from '../rules/task';
import type { CompleteResult, GameState, GameStore } from '../store';

const DAY = 24 * 60 * 60 * 1000;
const STAGE_TEXT: Record<DoughStage, string> = { soft: '🫧 말랑', grumpy: '😤 심술', monster: '👾 몬스터' };
const RESIDENT_TEXT: Record<ResidentKind, string> = { sprout: '🌱 새싹', sleepy: '😴 꾸벅이', trouble: '😈 말썽' };
const HABIT_TEXT: Record<HabitId, { name: string; how: string }> = {
  'many-done': { name: '📦 차곡차곡 해내기', how: `하루에 서로 다른 할 일 ${HABITS.manyDoneCount}개 완료` },
  'rest-and-return': {
    name: '☕ 쉬고 돌아오기',
    how: `${HABITS.restAndReturnFocusMinutes}분 집중 → 짧은 휴식(앞 집중의 1/${HABITS.focusToRestRatio} 이하) → 다시 ${HABITS.restAndReturnFocusMinutes}분`,
  },
  'deep-focus': { name: '🎯 푹 몰입하기', how: `끊지 않고 ${HABITS.deepFocusMinutes}분 집중` },
};

export function mountTaskPanel(root: HTMLElement, store: GameStore): void {
  root.innerHTML = `
    <form class="add">
      <h2>할 일 등록</h2>
      <input name="title" placeholder="예: 보고서 쓰기" maxlength="40" required />
      <label>시작 <input name="start" type="datetime-local" required /></label>
      <label>마감 <input name="due" type="datetime-local" required /></label>
      <p class="error" hidden></p>
      <button type="submit">반죽 만들기</button>
    </form>
    <section>
      <h2>내 반죽 <span class="count"></span></h2>
      <ul class="tasks"></ul>
    </section>
    <section>
      <h2>집중 습관</h2>
      <ul class="habits"></ul>
    </section>
    <section>
      <h2>도감</h2>
      <p class="dex"></p>
    </section>
    <p class="toast" hidden></p>
  `;

  const form = root.querySelector<HTMLFormElement>('form.add')!;
  const error = root.querySelector<HTMLElement>('.error')!;
  const list = root.querySelector<HTMLUListElement>('.tasks')!;
  const toast = root.querySelector<HTMLElement>('.toast')!;
  resetDates(form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const startAt = new Date(String(data.get('start'))).getTime();
    const dueAt = new Date(String(data.get('due'))).getTime();
    try {
      store.addTask(String(data.get('title')), startAt, dueAt);
      error.hidden = true;
      form.reset();
      resetDates(form);
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
    }
  });

  list.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const id = button.dataset.id!;
    const task = store.get().tasks.find((t) => t.id === id);
    if (!task) return;
    switch (button.dataset.action) {
      case 'focus': {
        const unlocks = store.get().focus?.taskId === id ? store.stopFocus() : store.startFocus(id);
        if (unlocks.length) showToast(toast, unlockMessage(unlocks));
        break;
      }
      case 'extend':
        if (confirm('마감을 하루 미룰까요? 미룬 횟수는 동네 친구들에게 보여요.')) store.extendTask(id, task.dueAt + DAY);
        break;
      case 'done':
        showToast(toast, birthMessage(store.completeTask(id)));
        break;
    }
  });

  const render = (state: GameState) => renderPanel(root, list, state, store);
  render(store.get());
  store.subscribe(render);
  setInterval(() => render(store.get()), 1000);
}

function renderPanel(root: HTMLElement, list: HTMLUListElement, state: GameState, store: GameStore): void {
  const now = Date.now();
  const active = state.tasks.filter((t) => t.completedAt === undefined);
  root.querySelector('.count')!.textContent = `${active.length}`;

  list.innerHTML = active.length
    ? active
        .map((t) => {
          const focusing = state.focus?.taskId === t.id;
          const ratio = Math.min(progressRatio(t, now), 9.99);
          const elapsed = focusing ? formatElapsed(now - state.focus!.startedAt) : '';
          return `
          <li class="${focusing ? 'focusing' : ''}">
            <div class="row">
              <strong>${escapeHtml(t.title)}</strong>
              <span>${focusing ? '😪 졸림' : STAGE_TEXT[doughStage(t, now)]}</span>
            </div>
            <div class="meta">
              마감 ${formatDate(t.dueAt)} · 진행 ${Math.round(ratio * 100)}% · 집중 ${t.focusMinutes}분
              ${t.dueExtensions ? ` · <b>마감 연장 ${t.dueExtensions}회 👀</b>` : ''}
            </div>
            <div class="buttons">
              <button data-action="focus" data-id="${t.id}">${focusing ? `집중 끝내기 ${elapsed}` : '집중'}</button>
              <button data-action="done" data-id="${t.id}">완료</button>
              <button data-action="extend" data-id="${t.id}" class="ghost">마감 +1일</button>
            </div>
          </li>`;
        })
        .join('')
    : '<li class="empty">아직 반죽이 없어요. 할 일을 등록해 보세요.</li>';

  root.querySelector('.habits')!.innerHTML = HABIT_IDS.map((id) => {
    const done = state.unlocks[id] !== undefined;
    return `<li class="${done ? 'done' : ''}"><div class="row"><strong>${HABIT_TEXT[id].name}</strong><span>${done ? '✅ 해금' : '🔒'}</span></div><div class="meta">${HABIT_TEXT[id].how}</div></li>`;
  }).join('');

  const count = (kind: ResidentKind, rare = false) =>
    state.residents.filter((r) => r.kind === kind && (kind !== 'sprout' || r.rare === rare)).length;
  const catalog = store.getCatalog();
  const met = new Set(state.residents.map((r) => r.speciesId).filter(Boolean));
  const metLine = catalog.length ? `\n만난 주민 ${met.size} / ${catalog.length}종` : '';
  root.querySelector('.dex')!.textContent =
    `🌱 새싹 ${count('sprout')} · ✨ 희귀 새싹 ${count('sprout', true)} · 😴 꾸벅이 ${count('sleepy')} · 😈 말썽 ${count('trouble')}${metLine}`;
}

function birthMessage({ resident: r, species, newUnlocks }: CompleteResult): string {
  const kind = r.kind === 'sprout' && r.rare ? '✨ 희귀 새싹' : RESIDENT_TEXT[r.kind];
  let text = `"${r.fromTask}"을(를) 끝내서 ${kind} 주민${species ? ` "${species.name}"` : ''}이(가) 태어났어요!`;
  if (r.kind === 'sleepy') text += ` (집중 ${RULES.focusMinutesForSleepy}분 이상 덕분에 개과천선)`;
  if (newUnlocks.length) text += `\n${unlockMessage(newUnlocks)}`;
  return text;
}

function unlockMessage(unlocks: HabitId[]): string {
  return `🔓 ${unlocks.map((id) => HABIT_TEXT[id].name).join(', ')} 달성! 새로운 주민을 만날 수 있어요.`;
}

function showToast(toast: HTMLElement, text: string): void {
  toast.textContent = text;
  toast.hidden = false;
  window.clearTimeout(Number(toast.dataset.timer));
  toast.dataset.timer = String(window.setTimeout(() => (toast.hidden = true), 5000));
}

function resetDates(form: HTMLFormElement): void {
  const now = Date.now();
  (form.elements.namedItem('start') as HTMLInputElement).value = toLocalInput(now);
  (form.elements.namedItem('due') as HTMLInputElement).value = toLocalInput(now + DAY);
}

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
