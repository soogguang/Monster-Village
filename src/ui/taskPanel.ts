// 할 일 패널 (화면 오른쪽)
// 글씨와 입력창은 게임 화면 위에 일반 웹 요소로 올려서 또렷하게 보이게 해요.

import { RULES } from '../config';
import { doughStage, progressRatio, type DoughStage, type ResidentKind } from '../rules/task';
import type { GameState, GameStore, Resident } from '../store';

const DAY = 24 * 60 * 60 * 1000;
const STAGE_TEXT: Record<DoughStage, string> = { soft: '🫧 말랑', grumpy: '😤 심술', monster: '👾 몬스터' };
const RESIDENT_TEXT: Record<ResidentKind, string> = { sprout: '🌱 새싹', sleepy: '😴 꾸벅이', trouble: '😈 말썽' };

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
      case 'focus':
        store.get().focus?.taskId === id ? store.stopFocus() : store.startFocus(id);
        break;
      case 'extend':
        if (confirm('마감을 하루 미룰까요? 미룬 횟수는 동네 친구들에게 보여요.')) store.extendTask(id, task.dueAt + DAY);
        break;
      case 'done':
        showToast(toast, store.completeTask(id));
        break;
    }
  });

  const render = (state: GameState) => renderPanel(root, list, state);
  render(store.get());
  store.subscribe(render);
  setInterval(() => render(store.get()), 1000);
}

function renderPanel(root: HTMLElement, list: HTMLUListElement, state: GameState): void {
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

  const count = (kind: ResidentKind, rare = false) =>
    state.residents.filter((r) => r.kind === kind && (kind !== 'sprout' || r.rare === rare)).length;
  root.querySelector('.dex')!.textContent =
    `🌱 새싹 ${count('sprout')} · ✨ 희귀 새싹 ${count('sprout', true)} · 😴 꾸벅이 ${count('sleepy')} · 😈 말썽 ${count('trouble')}`;
}

function showToast(toast: HTMLElement, r: Resident): void {
  const name = r.kind === 'sprout' && r.rare ? '✨ 희귀 새싹' : RESIDENT_TEXT[r.kind];
  toast.textContent = `"${r.fromTask}"을(를) 끝내서 ${name} 주민이 태어났어요!`;
  if (r.kind === 'sleepy') toast.textContent += ` (집중 ${RULES.focusMinutesForSleepy}분 이상 덕분에 개과천선)`;
  toast.hidden = false;
  window.setTimeout(() => (toast.hidden = true), 4000);
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
