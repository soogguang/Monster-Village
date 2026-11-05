// 가운데에 뜨는 창들 (할 일, 캘린더, 도감, 내 주민)
// 창 안의 목록은 저장소가 바뀔 때마다 다시 그리고, 입력 중인 폼은 건드리지 않아요.

import { roomView, type RoomViewState } from '../net/rooms';
import { friendshipStage } from '../rules/friendship';
import { HABIT_IDS } from '../rules/habits';
import { doughStage, progressRatio, type CalendarStyle, type Task } from '../rules/task';
import type { GameState, GameStore, Resident } from '../store';
import {
  DAY, HABIT_TEXT, RESIDENT_TEXT, STAGE_TEXT, WEEKDAYS, heartsText,
  escapeHtml, formatDate, fromLocalInput, startOfDay, toLocalInput,
} from './format';

export interface WindowContext {
  store: GameStore;
  characterDir: string;
  toast(text: string): void;
  /** 할 일을 끝냈을 때 알림 문구 */
  completeTask(taskId: string): void;
  toggleFocus(taskId: string): void;
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

    const render = (state: GameState) => {
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
          <form class="today-only" style="display:flex;gap:6px;flex:1">
            <input class="px-input" name="title" placeholder="오늘만 할 일 (예: 우체국 가기)" maxlength="40" style="flex:1" />
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
        case 'new': newForm.hidden = !newForm.hidden; if (!newForm.hidden) newForm.querySelector<HTMLInputElement>('[name=title]')!.focus(); break;
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
          const title = String(new FormData(form).get('title') ?? '');
          ctx.store.addTodayOnlyTask(title);
          ctx.toast(`🫧 "${title.trim()}" 반죽이 마당에 생겼어요! (오늘만 할 일)`);
        } else if (form.classList.contains('new')) {
          const values = readTaskForm(form);
          ctx.store.addTask(values.title, values.startAt, values.dueAt, values.calendarStyle);
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
        <span class="grow">${escapeHtml(t.title)}</span>
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
  return `<form class="slot edit" data-id="${t.id}">${taskFormFields(t.startAt, t.dueAt, t.title, t.calendarStyle ?? 'due')}
    <div class="meta">마감을 뒤로 미루면 "마감 연장"으로 기록돼요.</div>
    <div class="actions"><button class="px-btn small green">저장</button><button type="button" class="px-btn small ghost" data-act="cancel-edit">취소</button></div>
    <p class="form-error" hidden></p></form>`;
}

function taskFormFields(startAt: number, dueAt: number, title: string, style: CalendarStyle): string {
  return `<div class="form-grid">
    <input class="px-input full" name="title" placeholder="할 일 (예: 보고서 쓰기)" maxlength="40" required value="${escapeHtml(title)}" />
    <label>시작</label><input class="px-input" name="start" type="datetime-local" required value="${toLocalInput(startAt)}" />
    <label>마감</label><input class="px-input" name="due" type="datetime-local" required value="${toLocalInput(dueAt)}" />
    <label>달력</label>
    <div class="full-rest style-pick">
      <label><input type="radio" name="style" value="due" ${style === 'due' ? 'checked' : ''} /> 📌 마감일만 표시</label>
      <label><input type="radio" name="style" value="range" ${style === 'range' ? 'checked' : ''} /> ▬ 시작~마감 기간 표시</label>
    </div>
  </div>`;
}

function readTaskForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') ?? ''),
    startAt: fromLocalInput(String(data.get('start'))),
    dueAt: fromLocalInput(String(data.get('due'))),
    calendarStyle: (data.get('style') === 'range' ? 'range' : 'due') as CalendarStyle,
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
      let html = WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join('');
      for (let i = 0; i < 42; i++) {
        const day = new Date(first); day.setDate(first.getDate() + i);
        const dayStart = day.getTime();
        const items = tasksOnDay(state.tasks, dayStart);
        const chips = items.slice(0, 3).map(({ task, isDue, isStart }) => {
          const range = (task.calendarStyle ?? 'due') === 'range';
          const cls = ['cal-chip', range ? 'range' : '', range && !isStart ? 'cont' : '', isDue ? 'due' : '', task.completedAt !== undefined ? 'done' : ''].join(' ');
          const label = range && !isStart && day.getDay() !== 0 ? (isDue ? '📌' : '&nbsp;') : `${isDue ? '📌' : ''}${escapeHtml(task.title)}`;
          return `<div class="${cls}" title="${escapeHtml(task.title)}">${label}</div>`;
        }).join('');
        const more = items.length > 3 ? `<div class="cal-more">+${items.length - 3}</div>` : '';
        const cls = ['cal-day', day.getMonth() !== month.getMonth() ? 'other' : '', dayStart === today ? 'today' : '', dayStart === selected ? 'selected' : '', inDrag(dayStart) ? 'dragging' : ''].join(' ');
        html += `<div class="${cls}" data-day="${dayStart}"><span class="num">${day.getDate()}</span>${chips}${more}</div>`;
      }
      grid.innerHTML = html;

      const d = new Date(selected);
      body.querySelector('.day-title')!.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
      const items = tasksOnDay(state.tasks, selected);
      body.querySelector('.day-list')!.innerHTML = items.length
        ? items.map(({ task, isDue }) => `<div class="slot"><div class="row"><span class="grow">${task.completedAt !== undefined ? '✅ ' : ''}${escapeHtml(task.title)}</span>${isDue ? '<span class="badge warn">마감</span>' : ''}</div><div class="meta">${formatDate(task.startAt)} → ${formatDate(task.dueAt)}</div></div>`).join('')
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
        ? { startAt: Math.min(now, from), dueAt: to + DAY - 60 * 1000, style: 'due' }
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
        ctx.store.addTask(values.title, values.startAt, values.dueAt, values.calendarStyle);
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
          return `<div class="dex-card ${count ? '' : 'locked'}">
            <img src="${ctx.characterDir}${c.image}" alt="" />
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

// ---------------------------------------------------------------- 방 (친구와 함께)

export const roomsWindow: GameWindow = {
  id: 'rooms', title: '우리 방', icon: '🏕️', key: 'G', label: '방',
  mount(body, ctx) {
    let mode: 'none' | 'create' | 'join' = 'none';

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
          ${m.userId === me ? '' : `<button class="px-btn small ghost" data-act="bell" data-id="${m.userId}" title="응원의 종 치기">🔔</button>`}</div>
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
        <div class="room-layout">
          <div><h3>👥 멤버 (🔥 ${rs.online.filter((p) => p.focusingOn).length}명 집중 중)</h3>${members}</div>
          <div><h3>🌳 나무 · 공동 할 일</h3>
            <form class="room-task slot row"><input class="px-input grow" name="title" maxlength="40" placeholder="같이 할 일 (예: 발표 자료)" required />
              <input class="px-input" name="due" type="date" title="마감일 (선택)" /><button class="px-btn small green">걸기</button></form>
            ${tree}
          </div>
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

export const WINDOWS: GameWindow[] = [tasksWindow, calendarWindow, dexWindow, residentsWindow, roomsWindow];
