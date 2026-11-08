// 가운데에 뜨는 창들 (할 일, 캘린더, 도감, 내 주민)
// 창 안의 목록은 저장소가 바뀔 때마다 다시 그리고, 입력 중인 폼은 건드리지 않아요.

import { FRIENDSHIP, RULES } from '../config';
import { roomView, type RoomViewState } from '../net/rooms';
import { friendshipStage } from '../rules/friendship';
import { HABIT_IDS } from '../rules/habits';
import { TASK_COLORS, doughStage, isTaskColor, progressRatio, type CalendarStyle, type Task, type TaskColor } from '../rules/task';
import { TASK_COLOR_STYLE, colorOf, layoutWeek } from './calendarLayout';
import type { GameState, GameStore, Resident } from '../store';
import {
  DAY, HABIT_TEXT, RESIDENT_TEXT, STAGE_TEXT, WEEKDAYS, heartsText,
  defaultStartForDay, escapeHtml, formatDate, fromLocalInput, startOfDay, toLocalInput, toTimeInput, todayAt,
} from './format';

export interface WindowContext {
  store: GameStore;
  characterDir: string;
  toast(text: string): void;
  /** 할 일을 끝냈을 때 알림 문구 */
  completeTask(taskId: string): void;
  toggleFocus(taskId: string): void;
  openWindow(id: string): void;
  closeWindow(): void;
  /** 광장 사물에서 열면 해당 내용만 보여줘요. */
  roomSection?: 'tree' | 'members';
}

export interface GameWindow {
  id: string;
  title: string;
  icon: string;
  /** 단축키 (영어 대문자) */
  key: string;
  label: string;
  mount(body: HTMLElement, ctx: WindowContext): () => void;
}

// ---------------------------------------------------------------- 할 일

export const tasksWindow: GameWindow = {
  id: 'tasks', title: '할 일 수첩', icon: '📋', key: 'T', label: '할 일',
  mount(body, ctx) {
    let tab: 'today' | 'all' | 'done' = 'today';
    let editingId: string | null = null;
    let picking = false;

    body.innerHTML = `
      <div class="tabs">
        <button class="px-btn small" data-tab="today">오늘 할 일</button>
        <button class="px-btn small" data-tab="all">전체</button>
        <button class="px-btn small" data-tab="done">끝낸 일</button>
        <span style="flex:1"></span>
        <button class="px-btn small green" data-act="new">+ 새 할 일</button>
      </div>
      <form class="new slot" hidden>${taskFormFields(Date.now(), Date.now() + DAY, '', 'due')}
        <div class="actions"><button class="px-btn small green">반죽 만들기</button><button type="button" class="px-btn small ghost" data-act="cancel-new">취소</button></div>
        <p class="form-error" hidden></p>
      </form>
      <div class="today-tools" style="margin-top:8px"></div>
      <div class="list" style="margin-top:8px"></div>`;
    const newForm = body.querySelector<HTMLFormElement>('form.new')!;
    const tools = body.querySelector<HTMLElement>('.today-tools')!;
    const list = body.querySelector<HTMLElement>('.list')!;

    // 화면을 다시 그려도 고치던 입력 칸(할 일 고치기, 오늘만 할 일)의 내용은 그대로 둬요.
    const render = (state: GameState) => keepInputs(body, () => draw(state));
    const draw = (state: GameState) => {
      body.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
      tools.hidden = tab !== 'today';
      if (tab === 'today') renderTodayTools();

      const shown =
        tab === 'today' ? ctx.store.todayPlan()
        : tab === 'all' ? state.tasks.filter((t) => t.completedAt === undefined).sort((a, b) => a.dueAt - b.dueAt)
        : state.tasks.filter((t) => t.completedAt !== undefined).sort((a, b) => b.completedAt! - a.completedAt!);
      const emptyText = {
        today: '아직 오늘 할 일을 고르지 않았어요.<br />[오늘 할 수 있는 일 가져오기]로 골라 보세요.',
        all: '등록된 할 일이 없어요. 새 할 일을 등록해 보세요.',
        done: '아직 끝낸 일이 없어요.',
      }[tab];
      list.innerHTML = shown.length
        ? shown.map((t) => (t.id === editingId ? editSlot(t) : taskSlot(t, state, tab === 'today'))).join('')
        : `<div class="empty">${emptyText}</div>`;
    };

    // 오늘 탭 위쪽: 가져오기, 오늘만 할 일 추가
    const renderTodayTools = () => {
      if (!picking) {
        tools.innerHTML = `<div class="row" style="display:flex;gap:6px">
          <button class="px-btn small" data-act="pick">📥 오늘 할 수 있는 일 가져오기</button>
          <form class="today-only" style="display:flex;gap:6px;flex:1;align-items:center">
            <input class="px-input" name="title" placeholder="오늘만 할 일 (예: 우체국 가기)" maxlength="40" style="flex:1" />
            <label class="muted" title="시작 시각 (기본은 지금, 필요하면 바꿔요)">시작</label>
            <input class="px-input" name="start" type="time" value="${toTimeInput(Date.now())}" title="시작 시각 (기본은 지금, 필요하면 바꿔요)" style="width:auto" />
            <button type="button" class="px-btn small ghost" data-start-now title="시작을 지금 시각으로">지금</button>
            <button class="px-btn small green">+ 추가</button>
          </form></div>`;
        return;
      }
      const candidates = ctx.store.todayCandidates();
      const now = Date.now();
      tools.innerHTML = `<form class="pick slot">
        <strong>오늘 할 수 있는 일</strong> <span class="muted">(시작일이 지났고 아직 안 끝난 일)</span>
        ${candidates.length
          ? candidates.map((t) => `<label class="row" style="margin-top:6px;cursor:pointer">
              <input type="checkbox" name="id" value="${t.id}" />
              <span class="grow">${escapeHtml(t.title)}</span>
              ${t.dueAt < now ? '<span class="badge warn">마감 지남</span>' : `<span class="badge">마감 ${formatDate(t.dueAt)}</span>`}
            </label>`).join('')
          : '<div class="empty" style="margin-top:6px">가져올 수 있는 일이 없어요.</div>'}
        <div class="actions"><button class="px-btn small green" ${candidates.length ? '' : 'disabled'}>가져오기</button><button type="button" class="px-btn small ghost" data-act="cancel-pick">닫기</button></div>
      </form>`;
    };

    body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-act]');
      if (!el) return;
      if (el.dataset.tab) { tab = el.dataset.tab as typeof tab; editingId = null; picking = false; return render(ctx.store.get()); }
      const id = el.dataset.id!;
      switch (el.dataset.act) {
        case 'new':
          newForm.hidden = !newForm.hidden;
          // 열 때마다 시작은 지금, 마감은 하루 뒤로 새로 채워요. (창을 오래 열어 뒀어도 지금 시각이 들어가게)
          if (!newForm.hidden) { resetTaskForm(newForm, Date.now(), Date.now() + DAY); newForm.querySelector<HTMLInputElement>('[name=title]')!.focus(); }
          break;
        case 'cancel-new': newForm.hidden = true; break;
        case 'pick': picking = true; render(ctx.store.get()); break;
        case 'cancel-pick': picking = false; render(ctx.store.get()); break;
        case 'unplan': ctx.store.removeFromToday(id); break;
        case 'focus': ctx.toggleFocus(id); break;
        case 'done': ctx.completeTask(id); break;
        case 'edit': editingId = id; render(ctx.store.get()); break;
        case 'cancel-edit': editingId = null; render(ctx.store.get()); break;
      }
    });

    // 오늘만 할 일의 시작 칸을 직접 바꿨는지 기억해요.
    body.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'start' && el.closest('form.today-only')) el.dataset.touched = '1';
    });

    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const error = form.querySelector<HTMLElement>('.form-error');
      try {
        if (form.classList.contains('pick')) {
          const ids = new FormData(form).getAll('id').map(String);
          if (ids.length) ctx.store.addToToday(ids);
          picking = false;
          render(ctx.store.get());
        } else if (form.classList.contains('today-only')) {
          const data = new FormData(form);
          const title = String(data.get('title') ?? '');
          // 시작 칸을 직접 바꾸지 않았으면 "누른 순간"을 시작으로 써요. (창을 오래 열어 둬도 지금 시각이 들어가게)
          const startInput = form.elements.namedItem('start') as HTMLInputElement;
          const startAt = startInput.dataset.touched ? todayAt(String(data.get('start')), Date.now()) : undefined;
          ctx.store.addTodayOnlyTask(title, startAt);
          ctx.toast(`🫧 "${title.trim()}" 반죽이 마당에 생겼어요! (오늘만 할 일)`);
        } else if (form.classList.contains('new')) {
          const values = readTaskForm(form);
          ctx.store.addTask(values.title, values.startAt, values.dueAt, values.calendarStyle, values.color);
          form.reset();
          resetTaskForm(form, Date.now(), Date.now() + DAY);
          form.hidden = true;
          ctx.toast(`🫧 "${values.title.trim()}" 반죽이 마당에 생겼어요!`);
        } else {
          const values = readTaskForm(form);
          const before = ctx.store.get().tasks.find((t) => t.id === form.dataset.id)!;
          ctx.store.updateTask(form.dataset.id!, values);
          if (values.dueAt > before.dueAt) ctx.toast('📅 마감을 미뤘어요. 미룬 횟수는 동네 친구들에게 보여요.');
          editingId = null;
          render(ctx.store.get());
        }
      } catch (err) {
        if (error) { error.textContent = (err as Error).message; error.hidden = false; }
        else ctx.toast((err as Error).message);
      }
    });

    render(ctx.store.get());
    return ctx.store.subscribe((s) => render(s));
  },
};

function taskSlot(t: Task, state: GameState, inToday: boolean): string {
  const now = Date.now();
  if (t.completedAt !== undefined) {
    return `<div class="slot"><div class="row"><span class="grow">✅ ${escapeHtml(t.title)}</span><span class="muted">${formatDate(t.completedAt)} 완료</span></div>
      <div class="meta">집중 ${t.focusMinutes}분${t.dueExtensions ? ` · 마감 연장 ${t.dueExtensions}회` : ''}</div></div>`;
  }
  const focusing = state.focus?.taskId === t.id;
  const ratio = Math.min(progressRatio(t, now), 9.99);
  return `
    <div class="slot ${focusing ? 'focusing' : ''}">
      <div class="row">
        <span class="grow">${colorDot(t)}${escapeHtml(t.title)}</span>
        ${t.dueExtensions ? `<span class="badge warn">연장 ${t.dueExtensions}회 👀</span>` : ''}
        <span class="badge">${focusing ? '😪 졸림' : STAGE_TEXT[doughStage(t, now)]}</span>
      </div>
      <div class="meta">${(t.calendarStyle ?? 'due') === 'range' ? '▬' : '📌'} ${formatDate(t.startAt)} → ${formatDate(t.dueAt)} · 진행 ${Math.round(ratio * 100)}% · 집중 ${t.focusMinutes}분</div>
      <div class="actions">
        <button class="px-btn small ${focusing ? 'red' : 'green'}" data-act="focus" data-id="${t.id}">${focusing ? '집중 끝내기' : '🔥 집중'}</button>
        <button class="px-btn small" data-act="done" data-id="${t.id}">완료!</button>
        <button class="px-btn small ghost" data-act="edit" data-id="${t.id}">수정</button>
        ${inToday ? `<button class="px-btn small ghost" data-act="unplan" data-id="${t.id}">오늘에서 빼기</button>` : ''}
      </div>
    </div>`;
}

function editSlot(t: Task): string {
  return `<form class="slot edit" data-id="${t.id}">${taskFormFields(t.startAt, t.dueAt, t.title, t.calendarStyle ?? 'due', colorOf(t))}
    <div class="meta">마감을 뒤로 미루면 "마감 연장"으로 기록돼요.</div>
    <div class="actions"><button class="px-btn small green">저장</button><button type="button" class="px-btn small ghost" data-act="cancel-edit">취소</button></div>
    <p class="form-error" hidden></p></form>`;
}

function taskFormFields(startAt: number, dueAt: number, title: string, style: CalendarStyle, color: TaskColor = 'sky'): string {
  return `<div class="form-grid">
    <input class="px-input full" name="title" placeholder="할 일 (예: 보고서 쓰기)" maxlength="40" required value="${escapeHtml(title)}" />
    <label>시작</label><div class="start-field"><input class="px-input" name="start" type="datetime-local" required value="${toLocalInput(startAt)}" /><button type="button" class="px-btn small ghost" data-start-now title="시작을 지금 시각으로">지금</button></div>
    <label>마감</label><input class="px-input" name="due" type="datetime-local" required value="${toLocalInput(dueAt)}" />
    <label>달력</label>
    <div class="full-rest style-pick">
      <label><input type="radio" name="style" value="due" ${style === 'due' ? 'checked' : ''} /> 📌 마감일만 표시</label>
      <label><input type="radio" name="style" value="range" ${style === 'range' ? 'checked' : ''} /> ▬ 시작~마감 기간 표시</label>
    </div>
    <label>색</label>
    <div class="full-rest color-pick">${TASK_COLORS.map((c) => `<label title="${TASK_COLOR_STYLE[c].name}">
      <input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''} aria-label="${TASK_COLOR_STYLE[c].name}" />
      <span class="swatch" style="--bg:${TASK_COLOR_STYLE[c].bg};--edge:${TASK_COLOR_STYLE[c].edge}"></span></label>`).join('')}</div>
  </div>`;
}

// 할 일 칸의 [지금] 버튼: 시작을 지금 시각으로 채워요. (할 일 수첩·달력 어디서든)
document.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-start-now]');
  const input = button?.closest('form')?.querySelector<HTMLInputElement>('input[name=start]');
  if (!input) return;
  input.value = input.type === 'time' ? toTimeInput(Date.now()) : toLocalInput(Date.now());
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

/**
 * 창 내용을 다시 그릴 때, 열려 있던 입력 칸에 적던 내용과 커서 위치를 그대로 되살려요.
 * (데이터가 바뀌어 목록을 새로 그려도, 고치던 칸이 원래 값으로 되돌아가지 않게)
 */
function keepInputs(root: HTMLElement, redraw: () => void): void {
  type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const keyOf = (form: HTMLFormElement, el: Field) =>
    `${form.className}|${form.dataset.id ?? ''}|${el.name}|${el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? el.value : ''}`;
  const fields = () => [...root.querySelectorAll<HTMLFormElement>('form')].flatMap((form) =>
    [...form.elements].filter((el): el is Field => 'name' in el && Boolean((el as Field).name)).map((el) => ({ key: keyOf(form, el), el })));
  const saved = new Map<string, { value: string; checked: boolean; touched?: string }>();
  let focused: string | null = null;
  for (const { key, el } of fields()) {
    saved.set(key, { value: el.value, checked: el instanceof HTMLInputElement && el.checked, touched: el.dataset.touched });
    if (el === document.activeElement) focused = key;
  }
  redraw();
  for (const { key, el } of fields()) {
    const s = saved.get(key);
    if (!s) continue;
    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) el.checked = s.checked;
    else el.value = s.value;
    if (s.touched) el.dataset.touched = s.touched;
    if (key === focused) el.focus();
  }
}

function readTaskForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') ?? ''),
    startAt: fromLocalInput(String(data.get('start'))),
    dueAt: fromLocalInput(String(data.get('due'))),
    calendarStyle: (data.get('style') === 'range' ? 'range' : 'due') as CalendarStyle,
    color: isTaskColor(data.get('color')) ? (data.get('color') as TaskColor) : undefined,
  };
}

function resetTaskForm(form: HTMLFormElement, startAt: number, dueAt: number) {
  (form.elements.namedItem('start') as HTMLInputElement).value = toLocalInput(startAt);
  (form.elements.namedItem('due') as HTMLInputElement).value = toLocalInput(dueAt);
}

// ---------------------------------------------------------------- 캘린더

export const calendarWindow: GameWindow = {
  id: 'calendar', title: '달력', icon: '📅', key: 'C', label: '캘린더',
  mount(body, ctx) {
    const today = startOfDay(Date.now());
    let month = new Date(today); month.setDate(1);
    let selected = today;
    /** 드래그 중인 범위 (날짜 시작 시각) */
    let drag: { from: number; to: number } | null = null;
    /** 오른쪽 추가 칸에 채워 둔 기본값 */
    let draft: { startAt: number; dueAt: number; style: CalendarStyle } | null = null;

    body.innerHTML = `
      <div class="cal-layout">
        <div>
          <div class="cal-head">
            <button class="px-btn small ghost" data-act="prev">◀</button>
            <strong class="title"></strong>
            <button class="px-btn small ghost" data-act="next">▶</button>
            <button class="px-btn small ghost" data-act="today">오늘</button>
          </div>
          <p class="muted cal-hint">날짜를 누르면 그날이 마감인 할 일, 여러 날을 끌면 기간 할 일을 만들어요.</p>
          <div class="cal-grid"></div>
        </div>
        <div>
          <h3 class="day-title"></h3>
          <div class="day-list"></div>
          <div class="draft"></div>
        </div>
      </div>`;
    const grid = body.querySelector<HTMLElement>('.cal-grid')!;
    const draftEl = body.querySelector<HTMLElement>('.draft')!;

    const inDrag = (day: number) => drag !== null && day >= Math.min(drag.from, drag.to) && day <= Math.max(drag.from, drag.to);

    const render = (state: GameState) => {
      body.querySelector('.title')!.textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
      const first = new Date(month);
      first.setDate(1 - first.getDay());
      // 맥 캘린더처럼: 기간 할 일은 칸을 가로지르는 막대(주마다 같은 줄), 마감일만 할 일은 "● 제목 시각" 한 줄
      let html = `<div class="cal-weekdays">${WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join('')}</div>`;
      for (let week = 0; week < 6; week++) {
        const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + week * 7 + i); return d; });
        const layout = layoutWeek(state.tasks, days.map((d) => d.getTime()));
        const cells = days.map((day, col) => {
          const dayStart = day.getTime();
          const cell = layout.cells[col];
          // 줄마다: 막대가 지나가는 줄은 비워 두고(막대는 위에 겹쳐 그려요), 나머지 줄에 한 줄 할 일
          const rows = cell.rows.map((t) => t === null ? '<div class="cal-slot"></div>'
            : `<div class="cal-slot cal-item ${t.completedAt !== undefined ? 'done' : ''}" title="${escapeHtml(t.title)}">${colorDot(t)}<span class="t">${escapeHtml(t.title)}</span>${dueTime(t.dueAt)}</div>`).join('');
          const more = cell.hidden ? `<div class="cal-more">+${cell.hidden}개</div>` : '';
          const cls = ['cal-day', day.getMonth() !== month.getMonth() ? 'other' : '', dayStart === today ? 'today' : '', dayStart === selected ? 'selected' : '', inDrag(dayStart) ? 'dragging' : ''].join(' ');
          return `<div class="${cls}" data-day="${dayStart}"><span class="num">${day.getDate()}</span>${rows}${more}</div>`;
        }).join('');
        const bars = layout.bars.map((b) => {
          const { bg, edge } = TASK_COLOR_STYLE[colorOf(b.task)];
          const cls = ['cal-bar', b.fromBefore ? 'from-before' : '', b.toAfter ? 'to-after' : '', b.task.completedAt !== undefined ? 'done' : ''].join(' ');
          return `<div class="${cls}" title="${escapeHtml(b.task.title)}" style="--c:${b.startCol};--s:${b.endCol - b.startCol + 1};--lane:${b.lane};--bg:${bg};--edge:${edge}">
            <span class="t">${escapeHtml(b.task.title)}</span>${b.dueInWeek ? '<span class="pin">📌</span>' : ''}</div>`;
        }).join('');
        html += `<div class="cal-week">${cells}<div class="cal-bars">${bars}</div></div>`;
      }
      grid.innerHTML = html;

      const d = new Date(selected);
      body.querySelector('.day-title')!.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
      const items = tasksOnDay(state.tasks, selected);
      body.querySelector('.day-list')!.innerHTML = items.length
        ? items.map(({ task, isDue }) => `<div class="slot"><div class="row"><span class="grow">${task.completedAt !== undefined ? '✅ ' : ''}${colorDot(task)}${escapeHtml(task.title)}</span>${isDue ? '<span class="badge warn">마감</span>' : ''}</div><div class="meta">${formatDate(task.startAt)} → ${formatDate(task.dueAt)}</div></div>`).join('')
        : '<div class="empty">이 날 표시된 할 일이 없어요.</div>';
    };

    const renderDraft = () => {
      if (!draft) { draftEl.innerHTML = ''; return; }
      draftEl.innerHTML = `<h3>${draft.style === 'range' ? '▬ 기간 할 일 만들기' : '📌 이 날이 마감인 할 일 만들기'}</h3>
        <form class="add slot">${taskFormFields(draft.startAt, draft.dueAt, '', draft.style)}
          <div class="actions"><button class="px-btn small green">반죽 만들기</button><button type="button" class="px-btn small ghost" data-act="cancel-draft">취소</button></div>
          <p class="form-error" hidden></p></form>`;
      draftEl.querySelector<HTMLInputElement>('[name=title]')!.focus();
    };

    // 날짜 하나 클릭 → 그날이 마감인 할 일 / 여러 날 끌기 → 기간 할 일
    const dayAt = (e: PointerEvent) => {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-day]');
      return el ? Number(el.dataset.day) : null;
    };
    grid.addEventListener('pointerdown', (e) => {
      const day = dayAt(e);
      if (day === null) return;
      e.preventDefault();
      drag = { from: day, to: day };
      render(ctx.store.get());
    });
    grid.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const day = dayAt(e);
      if (day !== null && day !== drag.to) { drag.to = day; render(ctx.store.get()); }
    });
    const finishDrag = () => {
      if (!drag) return;
      const from = Math.min(drag.from, drag.to);
      const to = Math.max(drag.from, drag.to);
      drag = null;
      selected = to;
      const now = Date.now();
      draft = from === to
        ? { startAt: defaultStartForDay(from, now), dueAt: to + DAY - 60 * 1000, style: 'due' }
        : { startAt: from + 9 * 60 * 60 * 1000, dueAt: to + DAY - 60 * 1000, style: 'range' };
      render(ctx.store.get());
      renderDraft();
    };
    window.addEventListener('pointerup', finishDrag);

    body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'prev') month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      else if (el.dataset.act === 'next') month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      else if (el.dataset.act === 'today') { month = new Date(today); month.setDate(1); selected = today; }
      else if (el.dataset.act === 'cancel-draft') { draft = null; renderDraft(); return; }
      render(ctx.store.get());
    });

    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const error = form.querySelector<HTMLElement>('.form-error')!;
      try {
        const values = readTaskForm(form);
        ctx.store.addTask(values.title, values.startAt, values.dueAt, values.calendarStyle, values.color);
        draft = null;
        renderDraft();
        ctx.toast(`🫧 "${values.title.trim()}" 반죽이 마당에 생겼어요!`);
      } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
      }
    });

    render(ctx.store.get());
    const unsubscribe = ctx.store.subscribe((s) => render(s));
    return () => { unsubscribe(); window.removeEventListener('pointerup', finishDrag); };
  },
};

/**
 * 이 날짜 칸에 보여줄 할 일
 * - 📌 마감일만: 마감일 칸에만
 * - ▬ 기간: 시작일부터 마감일(끝냈으면 끝낸 날)까지
 */
function tasksOnDay(tasks: Task[], dayStart: number): { task: Task; isDue: boolean; isStart: boolean }[] {
  const dayEnd = dayStart + DAY;
  const inDay = (ms: number) => ms >= dayStart && ms < dayEnd;
  return tasks
    .filter((t) => (t.calendarStyle ?? 'due') === 'range'
      ? t.startAt < dayEnd && Math.min(t.completedAt ?? t.dueAt, t.dueAt) >= dayStart
      : inDay(t.dueAt))
    .map((task) => ({ task, isDue: inDay(task.dueAt), isStart: inDay(task.startAt) }))
    // 기간 막대가 날마다 같은 줄에 이어져 보이도록 기간 할 일을 항상 위에 둬요.
    .sort((a, b) => rangeFirst(a.task) - rangeFirst(b.task) || a.task.startAt - b.task.startAt || a.task.dueAt - b.task.dueAt);
}

/** 할 일 색 동그라미 (끝낸 일은 회색) */
function colorDot(t: Task): string {
  const { edge } = TASK_COLOR_STYLE[t.completedAt !== undefined ? 'gray' : colorOf(t)];
  return `<span class="color-dot" style="--edge:${edge}"></span>`;
}

/** 마감 시각. 그날 끝(23:59)이면 하루 종일 일이라 시각을 적지 않아요 */
function dueTime(ms: number): string {
  const d = new Date(ms);
  if (d.getHours() === 23 && d.getMinutes() === 59) return '';
  const h = d.getHours();
  return `<span class="time">${h < 12 ? '오전' : '오후'} ${h % 12 || 12}${d.getMinutes() ? `:${String(d.getMinutes()).padStart(2, '0')}` : '시'}</span>`;
}

function rangeFirst(t: Task): number {
  return (t.calendarStyle ?? 'due') === 'range' ? 0 : 1;
}

// ---------------------------------------------------------------- 도감

export const dexWindow: GameWindow = {
  id: 'dex', title: '주민 도감', icon: '📖', key: 'B', label: '도감',
  mount(body, ctx) {
    let tab: 'residents' | 'habits' = 'residents';
    const render = (state: GameState) => {
      const catalog = ctx.store.getCatalog();
      const met = new Map<string, number>();
      for (const r of state.residents) if (r.speciesId) met.set(r.speciesId, (met.get(r.speciesId) ?? 0) + 1);
      const tabs = `<div class="tabs">
        <button class="px-btn small" data-tab="residents" aria-pressed="${tab === 'residents'}">주민 도감 (${met.size}/${catalog.length})</button>
        <button class="px-btn small" data-tab="habits" aria-pressed="${tab === 'habits'}">집중 습관</button></div>`;

      if (tab === 'habits') {
        body.innerHTML = tabs + HABIT_IDS.map((id) => {
          const at = state.unlocks[id];
          return `<div class="slot habit ${at ? 'done' : ''}"><div class="row"><span class="grow">${HABIT_TEXT[id].name}</span><span>${at ? `✅ ${formatDate(at)}` : '🔒'}</span></div><div class="meta">${HABIT_TEXT[id].how}</div></div>`;
        }).join('');
        return;
      }
      if (!catalog.length) {
        body.innerHTML = tabs + `<div class="empty">아직 등록된 캐릭터가 없어요.<br />캐릭터 목록(catalog.json)이 생기면 여기에 모여요.</div>`;
        return;
      }
      const sections: [string, (c: (typeof catalog)[number]) => boolean][] = [
        ['🌱 새싹', (c) => c.kind === 'sprout' && !c.rare],
        ['✨ 희귀 새싹', (c) => c.kind === 'sprout' && c.rare],
        ['😴 꾸벅이', (c) => c.kind === 'sleepy'],
        ['😈 말썽', (c) => c.kind === 'trouble'],
      ];
      body.innerHTML = tabs + sections.map(([name, test]) => {
        const items = catalog.filter(test);
        if (!items.length) return '';
        return `<h3>${name}</h3><div class="dex-grid">${items.map((c) => {
          const count = state.residents.find((r) => r.speciesId === c.id)?.hearts ?? 0;
          const lockedHabit = c.unlock && state.unlocks[c.unlock] === undefined ? HABIT_TEXT[c.unlock].name : '';
          // 못 만난 주민은 실제 그림을 넣지 않고 모양만 딴 그림자를 보여줘요. (그림을 끌거나 눌러도 모습이 보이지 않게)
          const picture = count
            ? `<img src="${ctx.characterDir}${c.image}" alt="" draggable="false" />`
            : `<div class="dex-silhouette" style="--shape:url('${ctx.characterDir}${encodeURI(c.image)}')"></div>`;
          return `<div class="dex-card ${count ? '' : 'locked'}">
            ${picture}
            <div class="name">${count ? escapeHtml(c.name) : '???'}</div>
            <div class="sub">${count ? `${heartsText(count)}<br />${escapeHtml(c.personality ?? '')}` : lockedHabit ? `🔒 ${lockedHabit}` : '아직 못 만났어요'}</div>
          </div>`;
        }).join('')}</div>`;
      }).join('');
    };
    body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (el) { tab = el.dataset.tab as typeof tab; render(ctx.store.get()); }
    });
    render(ctx.store.get());
    return ctx.store.subscribe((s) => render(s));
  },
};

// ---------------------------------------------------------------- 내 주민

export const residentsWindow: GameWindow = {
  id: 'residents', title: '내 주민들', icon: '🏡', key: 'R', label: '내 주민',
  mount(body, ctx) {
    let renamingId: string | null = null;
    const render = (state: GameState) => {
      const catalog = ctx.store.getCatalog();
      const residents = [...state.residents].sort((a, b) => b.bornAt - a.bornAt);
      if (!residents.length) {
        body.innerHTML = '<div class="empty">아직 마당에 주민이 없어요.<br />할 일을 끝내면 주민이 태어나요!</div>';
        return;
      }
      const shownCount = residents.filter((r) => r.visible).length;
      body.innerHTML = `<p class="muted" style="margin:0 0 8px">만난 주민 ${residents.length}명 · 마당에 나온 주민 ${shownCount}명</p>` + residents.map((r) => {
        const species = catalog.find((c) => c.id === r.speciesId);
        const name = r.nickname ?? species?.name ?? RESIDENT_TEXT[r.kind];
        const img = species ? `<img src="${ctx.characterDir}${species.image}" alt="" style="width:48px;height:54px;image-rendering:pixelated" />` : `<span style="font-size:28px;width:48px;text-align:center">${RESIDENT_TEXT[r.kind].split(' ')[0]}</span>`;
        const nameCell = r.id === renamingId
          ? `<form class="rename row" data-id="${r.id}"><input class="px-input" name="nickname" maxlength="12" value="${escapeHtml(r.nickname ?? '')}" placeholder="별명" /><button class="px-btn small green">저장</button></form>`
          : `<strong class="grow">${escapeHtml(name)}</strong><button class="px-btn small ghost" data-act="rename" data-id="${r.id}">별명</button>`;
        const stage = friendshipStage(r.hearts);
        const stageText = stage === 'evolved' ? '🌟 진화' : stage === 'friend' ? '💕 친한 사이' : '👋 처음 만남';
        return `<div class="slot ${r.visible ? '' : 'hidden-resident'}"><div class="row">${img}<div class="grow"><div class="row">${nameCell}</div>
          <div class="meta"><span class="hearts">${heartsText(r.hearts)}</span> ${stageText}</div>
          <div class="meta">${residentKindText(r)}${species && r.nickname ? ` · ${escapeHtml(species.name)}` : ''} · 처음 만난 날 ${formatDate(r.bornAt)} ("${escapeHtml(r.fromTask)}")</div></div>
          <label class="yard-toggle"><input type="checkbox" data-act="visible" data-id="${r.id}" ${r.visible ? 'checked' : ''} /> 마당에 나오기</label></div></div>`;
      }).join('');
    };
    body.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      if (box.dataset.act === 'visible') ctx.store.setResidentVisible(box.dataset.id!, box.checked);
    });
    body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act=rename]');
      if (el) { renamingId = el.dataset.id!; render(ctx.store.get()); body.querySelector<HTMLInputElement>('form.rename input')?.focus(); }
    });
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      renamingId = null;
      ctx.store.renameResident(form.dataset.id!, String(new FormData(form).get('nickname') ?? ''));
    });
    render(ctx.store.get());
    return ctx.store.subscribe((s) => render(s));
  },
};

function residentKindText(r: Resident): string {
  return r.kind === 'sprout' && r.rare ? '✨ 희귀 새싹' : RESIDENT_TEXT[r.kind];
}

// ---------------------------------------------------------------- 모닥불 (집중)

export const focusWindow: GameWindow = {
  id: 'focus', title: '모닥불 · 집중하기', icon: '🔥', key: '', label: '집중',
  mount(body, ctx) {
    const render = () => {
      const state = ctx.store.get();
      const active = state.tasks.filter((t) => t.completedAt === undefined);
      const room = roomView.state.active;
      body.innerHTML = `<p class="muted">${room ? `${escapeHtml(room.name)}에서 ${roomView.focusingCount()}명이 함께 집중하고 있어요.` : '내 할 일에 집중하며 잠시 머물러요.'}</p>
        ${active.length ? active.map((task) => `<div class="slot ${state.focus?.taskId === task.id ? 'focusing' : ''}"><div class="row">
          <strong class="grow">${escapeHtml(task.title)}</strong>
          <button class="px-btn small ${state.focus?.taskId === task.id ? 'red' : 'green'}" data-focus-id="${escapeHtml(task.id)}">${state.focus?.taskId === task.id ? '집중 끝내기' : '집중 시작'}</button>
        </div></div>`).join('') : '<div class="empty">집중할 할 일을 먼저 등록해 주세요.</div><button class="px-btn green" data-act="add-task">할 일 등록하러 가기</button>'}`;
    };
    body.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-focus-id],[data-act]');
      if (!button) return;
      if (button.dataset.act === 'add-task') { ctx.openWindow('tasks'); return; }
      if (button.dataset.focusId) {
        try { ctx.toggleFocus(button.dataset.focusId); ctx.closeWindow(); }
        catch (err) { ctx.toast((err as Error).message); }
      }
    });
    render();
    const offStore = ctx.store.subscribe(render);
    const offRoom = roomView.subscribe(render);
    return () => { offStore(); offRoom(); };
  },
};

// ---------------------------------------------------------------- 방 (친구와 함께)

export const roomsWindow: GameWindow = {
  id: 'rooms', title: '우리 방', icon: '🏕️', key: 'G', label: '방',
  mount(body, ctx) {
    let mode: 'none' | 'create' | 'join' = 'none';
    const section = ctx.roomSection;

    const render = (rs: RoomViewState) => {
      if (!rs.backend) {
        body.innerHTML = `<div class="empty">친구와 방을 만들려면 로그인이 필요해요.<br />오른쪽 위의 <b>카카오 로그인</b>을 눌러 주세요.</div>`;
        return;
      }
      const me = rs.backend.me.id;
      const roomTabs = rs.rooms.map((r) => `<button class="px-btn small" data-room="${r.id}" aria-pressed="${rs.active?.id === r.id}">${escapeHtml(r.name)}</button>`).join('');
      const forms = mode === 'create'
        ? `<form class="room-create slot row"><input class="px-input grow" name="name" maxlength="20" placeholder="방 이름 (예: 캡스톤 팀)" required /><button class="px-btn small green">만들기</button><button type="button" class="px-btn small ghost" data-act="close-form">취소</button></form>`
        : mode === 'join'
          ? `<form class="room-join slot row"><input class="px-input grow" name="code" maxlength="6" placeholder="초대 코드 6자리" required style="text-transform:uppercase" /><button class="px-btn small green">들어가기</button><button type="button" class="px-btn small ghost" data-act="close-form">취소</button></form>`
          : '';
      const head = `<div class="tabs">${roomTabs}<span style="flex:1"></span>
        <button class="px-btn small green" data-act="create">+ 새 방</button>
        <button class="px-btn small" data-act="join">초대 코드로 들어가기</button></div>${forms}<p class="form-error" hidden></p>`;

      const room = rs.active;
      if (!room) {
        body.innerHTML = head + `<div class="empty" style="margin-top:8px">아직 들어간 방이 없어요.<br />방을 만들거나 친구에게 받은 초대 코드로 들어가 보세요.</div>`;
        return;
      }
      const presence = new Map(rs.online.map((p) => [p.userId, p]));
      const members = rs.members.map((m) => {
        const p = presence.get(m.userId);
        const state = p?.focusingOn ? `🔥 집중 중 · ${escapeHtml(p.focusingOn)}` : p ? '🟢 접속 중' : '⚪ 오프라인';
        const residents = (m.save?.residents ?? []).length;
        return `<div class="slot"><div class="row"><strong class="grow">${escapeHtml(m.nickname)}${m.userId === me ? ' (나)' : ''}</strong>
          ${m.userId === me ? '' : `<button class="px-btn small ghost" data-act="bell" data-id="${m.userId}" title="응원의 종 치기">${section === 'members' ? '🔔 응원하기' : '🔔'}</button>`}</div>
          <div class="meta">${state} · 주민 ${residents}명</div></div>`;
      }).join('');
      const tasks = [...rs.tasks].sort((a, b) => Number(a.doneAt !== null) - Number(b.doneAt !== null) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
      const nameOf = (id: string | null) => rs.members.find((m) => m.userId === id)?.nickname ?? '누군가';
      const tree = tasks.length
        ? tasks.map((t) => `<div class="slot ${t.doneAt ? 'done-task' : ''}"><div class="row">
            <span class="grow">${t.doneAt ? '✅' : '🍃'} ${escapeHtml(t.title)}</span>
            ${t.dueAt ? `<span class="badge ${!t.doneAt && t.dueAt < Date.now() ? 'warn' : ''}">마감 ${formatDate(t.dueAt)}</span>` : ''}</div>
            <div class="meta">${escapeHtml(nameOf(t.createdBy))}님이 걸었어요${t.doneAt ? ` · ${escapeHtml(nameOf(t.doneBy))}님이 ${formatDate(t.doneAt)}에 끝냈어요` : ''}</div>
            <div class="actions">${t.doneAt ? '' : `<button class="px-btn small green" data-act="room-done" data-id="${t.id}">끝냈어요!</button>`}
            ${t.createdBy === me ? `<button class="px-btn small ghost" data-act="room-delete" data-id="${t.id}">떼기</button>` : ''}</div></div>`).join('')
        : '<div class="empty">아직 나무에 걸린 일이 없어요.</div>';

      body.innerHTML = head + `
        <div class="room-head slot row" style="margin-top:8px">
          <strong class="grow">🏕️ ${escapeHtml(room.name)}</strong>
          <span class="muted">초대 코드</span><span class="badge invite">${room.inviteCode}</span>
          <button class="px-btn small ghost" data-act="copy" data-code="${room.inviteCode}">복사</button>
          <button class="px-btn small ghost" data-act="leave">방 나가기</button>
        </div>
        ${section ? '' : `<div class="slot row">${rs.inVillage
          ? '<span class="grow">🏘️ 지금 이 방 마을에 있어요. <span class="muted">내 집 앞에서 E를 누르거나 집을 누르면 집으로 돌아가요.</span></span>'
          : '<span class="grow muted">🏠 지금은 내 집에 있어요. 친구들 집과 광장(모닥불·수호나무·종)은 방 마을에 있어요.</span><button class="px-btn small green" data-act="enter-village">🏘️ 이 방 마을로 가기</button>'}</div>`}
        ${section === 'members' ? '<p class="muted">응원을 보낼 친구를 골라 주세요.</p>' : ''}
        <div class="room-layout ${section ? 'single' : ''}">
          ${section !== 'tree' ? `<div><h3>👥 멤버 (🔥 ${rs.online.filter((p) => p.focusingOn).length}명 집중 중)</h3>${members}</div>` : ''}
          ${section !== 'members' ? `<div><h3>🌳 나무 · 공동 할 일</h3>
            <form class="room-task slot row"><input class="px-input grow" name="title" maxlength="40" placeholder="같이 할 일 (예: 발표 자료)" required />
              <input class="px-input" name="due" type="date" title="마감일 (선택)" /><button class="px-btn small green">걸기</button></form>
            ${tree}
          </div>` : ''}
        </div>`;
    };

    const showError = (err: unknown) => {
      const el = body.querySelector<HTMLElement>('.form-error');
      if (el) { el.textContent = (err as Error).message; el.hidden = false; } else ctx.toast((err as Error).message);
    };

    body.addEventListener('click', async (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-room]');
      if (!el) return;
      const backend = roomView.state.backend;
      try {
        if (el.dataset.room) {
          const room = roomView.state.rooms.find((r) => r.id === el.dataset.room);
          if (room) await roomView.open(room);
          return;
        }
        switch (el.dataset.act) {
          case 'create': mode = 'create'; render(roomView.state); body.querySelector<HTMLInputElement>('.room-create input')?.focus(); break;
          case 'join': mode = 'join'; render(roomView.state); body.querySelector<HTMLInputElement>('.room-join input')?.focus(); break;
          case 'close-form': mode = 'none'; render(roomView.state); break;
          case 'enter-village': roomView.enterVillage(); ctx.closeWindow(); break;
          case 'copy':
            await navigator.clipboard?.writeText(el.dataset.code!).catch(() => undefined);
            ctx.toast(`초대 코드 ${el.dataset.code}를 복사했어요. 친구에게 보내 주세요!`);
            break;
          case 'leave':
            if (confirm('이 방에서 나갈까요? 다시 들어오려면 초대 코드가 필요해요.')) await roomView.leave();
            break;
          case 'bell': {
            backend?.ringBell(el.dataset.id!);
            const name = roomView.state.members.find((m) => m.userId === el.dataset.id)?.nickname ?? '친구';
            ctx.toast(`🔔 ${name}님에게 응원의 종을 쳤어요!`);
            break;
          }
          case 'room-done': await backend?.completeTask(el.dataset.id!); break;
          case 'room-delete': await backend?.deleteTask(el.dataset.id!); break;
        }
      } catch (err) {
        showError(err);
      }
    });

    body.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const data = new FormData(form);
      try {
        if (form.classList.contains('room-create')) { await roomView.create(String(data.get('name'))); mode = 'none'; render(roomView.state); }
        if (form.classList.contains('room-join')) { await roomView.join(String(data.get('code'))); mode = 'none'; render(roomView.state); }
        if (form.classList.contains('room-task')) {
          const due = String(data.get('due') ?? '');
          await roomView.state.backend?.addTask(roomView.state.active!.id, String(data.get('title')), due ? fromLocalInput(`${due}T23:59`) : null);
        }
      } catch (err) {
        showError(err);
      }
    });

    render(roomView.state);
    return roomView.subscribe(render);
  },
};

export const treeWindow: GameWindow = {
  ...roomsWindow, id: 'tree', title: '수호나무 · 공동 할 일', icon: '🌳', key: '',
  mount: (body, ctx) => roomsWindow.mount(body, { ...ctx, roomSection: 'tree' }),
};

export const bellWindow: GameWindow = {
  ...roomsWindow, id: 'bell', title: '응원의 종', icon: '🔔', key: '',
  mount: (body, ctx) => roomsWindow.mount(body, { ...ctx, roomSection: 'members' }),
};

// ---------------------------------------------------------------- 사용 방법 (? 버튼, H)

/** 처음 들어온 사람에게 한 번 자동으로 보여줬는지 (이 브라우저 기준) */
export const HELP_SEEN_KEY = 'monster-village:help-seen';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const HELP_SECTIONS: { id: string; title: string; html: string }[] = [
  {
    id: 'about', title: '🏘️ 어떤 게임이에요?',
    html: `<p>할 일을 적으면 마당에 <b>말랑 반죽</b>이 생겨요. 미루면 반죽이 심술이 나고, 마감이 지나면 <b>몬스터</b>가 돼요.
      할 일을 끝내면 반죽이 <b>주민</b>으로 태어나서 내 마당에 살아요. 일찍 끝낼수록 귀하고 희귀한 주민을 만날 수 있어요.</p>
      <p>친구와 <b>방</b>을 만들면 서로의 집이 모인 마을에서 같이 집중하고 응원할 수 있어요.</p>`,
  },
  {
    id: 'controls', title: '🎮 조작',
    html: `<ul>
      <li><b>이동:</b> 방향키 또는 W·A·S·D</li>
      <li><b>사물 쓰기:</b> 수호나무·모닥불·종·우리 집 가까이에서 <kbd>E</kbd> 또는 그림을 클릭</li>
      <li><b>창 열기:</b> 아래 버튼 줄 또는 단축키 — <kbd>T</kbd> 할 일 · <kbd>C</kbd> 캘린더 · <kbd>B</kbd> 도감 · <kbd>R</kbd> 내 주민 · <kbd>G</kbd> 방 · <kbd>H</kbd> 사용 방법</li>
      <li><b>내 모습:</b> 첫 로그인에서 이름을 정한 다음 숲길·민트·라벤더 중 한 번 고르고 확정해요. 다음 접속에도 같은 모습으로 시작하고, 걸을 때는 양쪽 다리와 발이 번갈아 움직여요.</li>
      <li><b>창 닫기:</b> <kbd>Esc</kbd> 또는 오른쪽 위 ✕</li>
    </ul>`,
  },
  {
    id: 'tasks', title: '📋 할 일과 반죽',
    html: `<ul>
      <li>할 일 창(<kbd>T</kbd>)에서 <b>제목 · 시작 · 마감</b>을 적어 등록해요.</li>
      <li>🫧 <b>말랑 반죽</b>: 막 등록한 상태예요.</li>
      <li>😤 <b>심술 반죽</b>: 시작하고 여유 시간(기간의 ${pct(RULES.grumpyGraceRatio)}, 최대 ${RULES.grumpyGraceMaxMinutes}분)이 지나도 한 번도 집중하지 않았어요.</li>
      <li>👾 <b>몬스터</b>: 마감이 지났어요.</li>
      <li>집중하는 동안에는 어느 단계든 졸려서 얌전해져요 (z z).</li>
      <li>마감을 뒤로 미루면 미룬 횟수가 남고, 방 친구들에게도 보여요.</li>
    </ul>`,
  },
  {
    id: 'focus', title: '🔥 집중하기',
    html: `<ul>
      <li>왼쪽 위 상태 상자에서 할 일을 고르고 <b>🔥 집중</b>을 눌러요. 끝낼 때는 <b>집중 끝내기</b>.</li>
      <li>방 마을에서는 <b>모닥불</b> 앞에서 <kbd>E</kbd>를 눌러도 집중을 시작할 수 있어요. 같이 집중하는 친구가 많을수록 모닥불이 커져요.</li>
      <li>창을 닫거나 노트북이 잠들어서 연결이 5분 넘게 끊기면, 마지막으로 연결된 시각에 집중이 끝난 것으로 기록돼요.</li>
    </ul>`,
  },
  {
    id: 'residents', title: '🌱 주민 만나기',
    html: `<p>할 일을 끝낸 시점(시작~마감 중 어디쯤인지)과 집중 여부로 주민이 정해져요.</p>
      <table class="help-table"><thead><tr><th>끝낸 시점</th><th>태어나는 주민</th></tr></thead><tbody>
        <tr><td>기간의 ${pct(RULES.veryEarlyRatio)} 이전</td><td>🌱 새싹 (✨ 희귀가 잘 나와요)</td></tr>
        <tr><td>${pct(RULES.veryEarlyRatio)} ~ ${pct(RULES.lateRatio)}</td><td>🌱 새싹</td></tr>
        <tr><td>${pct(RULES.lateRatio)} 이후 또는 마감 후 · ${RULES.focusMinutesForSleepy}분 이상 집중함</td><td>😴 꾸벅이</td></tr>
        <tr><td>${pct(RULES.lateRatio)} 이후 또는 마감 후 · 집중 부족</td><td>😈 말썽</td></tr>
      </tbody></table>
      <ul>
        <li>같은 주민을 또 만나면 친밀도 ♥가 올라요. ♥${FRIENDSHIP.friendHearts}이면 친해져서 가끔 다가와 인사하고, ♥${FRIENDSHIP.evolveHearts}이면 진화해요.</li>
        <li>만난 주민은 도감(<kbd>B</kbd>)에 기록돼요. 내 주민(<kbd>R</kbd>)에서 별명을 짓고, 마당에 나올 주민을 고를 수 있어요.</li>
      </ul>`,
  },
  {
    id: 'habits', title: '🔓 집중 습관',
    html: `<p>집중 습관을 처음 한 번 해내면 새로운 주민을 만날 수 있게 돼요. (도감 → 집중 습관 탭)</p>
      <ul>${HABIT_IDS.map((id) => `<li><b>${HABIT_TEXT[id].name}</b>: ${HABIT_TEXT[id].how}</li>`).join('')}</ul>`,
  },
  {
    id: 'plan', title: '📅 오늘 할 일과 캘린더',
    html: `<ul>
      <li><b>오늘 할 일</b>에는 내가 오늘 하기로 고른 일만 들어가요. <b>[오늘 할 수 있는 일 가져오기]</b>로 골라 오거나, <b>오늘만 할 일</b>을 바로 추가해요.</li>
      <li>오늘 못 끝낸 일은 내일 자동으로 넘어가지 않고, 내일 다시 고를 수 있어요.</li>
      <li>캘린더(<kbd>C</kbd>)에서 날짜를 <b>클릭</b>하면 그날이 마감인 할 일, 여러 날을 <b>끌면</b> 기간 할 일을 바로 추가해요.</li>
      <li>할 일마다 캘린더에 📌 마감일만 / ▬ 기간 중 어떻게 보일지와 <b>색</b>을 고를 수 있어요. 기간 할 일은 날짜를 가로지르는 막대로, 마감일만 할 일은 "● 제목 시각" 한 줄로 보여요.</li>
    </ul>`,
  },
  {
    id: 'rooms', title: '🏕️ 친구와 방',
    html: `<ul>
      <li>방은 카카오로 로그인해야 쓸 수 있어요. 방 창(<kbd>G</kbd>)에서 <b>+ 새 방</b>을 만들고 <b>초대 코드</b>(6자리)를 친구에게 보내요.</li>
      <li>접속하면 언제나 <b>내 집</b>에서 시작해요. 방 창에서 <b>[이 방 마을로 가기]</b>를 누르면 친구들 집과 광장이 있는 마을로 가요.</li>
      <li>마을에서는 친구 마당에 걸어가서 친구 주민을 구경할 수 있어요.</li>
      <li>🌳 <b>수호나무</b>: 방 친구 누구나 같이 할 일을 걸고 끝낼 수 있어요.</li>
      <li>🔥 <b>모닥불</b>: 같이 집중해요. 🔔 <b>응원의 종</b>: 친구를 골라 응원을 보내요.</li>
      <li>마을에서 <b>내 집 앞에서 <kbd>E</kbd></b>를 누르면 내 집으로 돌아와요. 집에 있어도 종 알림과 친구 상태는 계속 받아요.</li>
    </ul>`,
  },
  {
    id: 'account', title: '👤 계정과 저장',
    html: `<ul>
      <li><b>카카오로 시작하기</b>로 로그인하면 내 데이터가 저장돼서 다른 기기에서도 이어져요.</li>
      <li><b>로그인 없이 해보기</b>로 하면 이 브라우저에만 저장돼요. 나중에 로그인하면 그대로 옮겨져요.</li>
      <li>오른쪽 위 👤 이름을 누르면 동네에서 쓰는 이름을 바꿀 수 있어요.</li>
    </ul>`,
  },
];

export const helpWindow: GameWindow = {
  id: 'help', title: '사용 방법', icon: '❓', key: 'H', label: '도움말',
  mount(body) {
    body.innerHTML = `<div class="help">
      <nav class="help-nav">${HELP_SECTIONS.map((s) => `<button class="px-btn small ghost" data-jump="${s.id}">${s.title}</button>`).join('')}</nav>
      ${HELP_SECTIONS.map((s) => `<section class="slot" data-section="${s.id}"><h3>${s.title}</h3>${s.html}</section>`).join('')}
    </div>`;
    const onClick = (e: Event) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-jump]')?.dataset.jump;
      if (id) body.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    body.addEventListener('click', onClick);
    try { window.localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* 저장이 막힌 브라우저 */ }
    return () => body.removeEventListener('click', onClick);
  },
};

export const WINDOWS: GameWindow[] = [tasksWindow, calendarWindow, dexWindow, residentsWindow, roomsWindow];
