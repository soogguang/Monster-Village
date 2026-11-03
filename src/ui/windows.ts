// 가운데에 뜨는 창들 (할 일, 캘린더, 도감, 내 주민)
// 창 안의 목록은 저장소가 바뀔 때마다 다시 그리고, 입력 중인 폼은 건드리지 않아요.

import { HABIT_IDS } from '../rules/habits';
import { doughStage, progressRatio, type Task } from '../rules/task';
import type { GameState, GameStore, Resident } from '../store';
import {
  DAY, HABIT_TEXT, RESIDENT_TEXT, STAGE_TEXT, WEEKDAYS,
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
    let tab: 'today' | 'later' | 'done' = 'today';
    let editingId: string | null = null;

    body.innerHTML = `
      <div class="tabs">
        <button class="px-btn small" data-tab="today">오늘</button>
        <button class="px-btn small" data-tab="later">앞으로</button>
        <button class="px-btn small" data-tab="done">끝낸 일</button>
        <span style="flex:1"></span>
        <button class="px-btn small green" data-act="new">+ 새 할 일</button>
      </div>
      <form class="new slot" hidden>${taskFormFields(Date.now(), Date.now() + DAY, '')}
        <div class="actions"><button class="px-btn small green">반죽 만들기</button><button type="button" class="px-btn small ghost" data-act="cancel-new">취소</button></div>
        <p class="form-error" hidden></p>
      </form>
      <div class="list" style="margin-top:8px"></div>`;
    const newForm = body.querySelector<HTMLFormElement>('form.new')!;
    const list = body.querySelector<HTMLElement>('.list')!;

    const render = (state: GameState) => {
      body.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
      const endOfToday = startOfDay(Date.now()) + DAY;
      const active = state.tasks.filter((t) => t.completedAt === undefined).sort((a, b) => a.dueAt - b.dueAt);
      const shown =
        tab === 'today' ? active.filter((t) => t.startAt < endOfToday)
        : tab === 'later' ? active.filter((t) => t.startAt >= endOfToday)
        : state.tasks.filter((t) => t.completedAt !== undefined).sort((a, b) => b.completedAt! - a.completedAt!);
      const emptyText = { today: '오늘 할 일이 없어요. 새 할 일을 등록해 보세요.', later: '예정된 할 일이 없어요.', done: '아직 끝낸 일이 없어요.' }[tab];
      list.innerHTML = shown.length
        ? shown.map((t) => (t.id === editingId ? editSlot(t) : taskSlot(t, state))).join('')
        : `<div class="empty">${emptyText}</div>`;
    };

    body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-act]');
      if (!el) return;
      if (el.dataset.tab) { tab = el.dataset.tab as typeof tab; editingId = null; return render(ctx.store.get()); }
      const id = el.dataset.id!;
      switch (el.dataset.act) {
        case 'new': newForm.hidden = !newForm.hidden; if (!newForm.hidden) newForm.querySelector<HTMLInputElement>('[name=title]')!.focus(); break;
        case 'cancel-new': newForm.hidden = true; break;
        case 'focus': ctx.toggleFocus(id); break;
        case 'done': ctx.completeTask(id); break;
        case 'edit': editingId = id; render(ctx.store.get()); break;
        case 'cancel-edit': editingId = null; render(ctx.store.get()); break;
      }
    });

    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const values = readTaskForm(form);
      const error = form.querySelector<HTMLElement>('.form-error')!;
      try {
        if (form.classList.contains('new')) {
          ctx.store.addTask(values.title, values.startAt, values.dueAt);
          form.reset();
          resetTaskForm(form, Date.now(), Date.now() + DAY);
          form.hidden = true;
          ctx.toast(`🫧 "${values.title.trim()}" 반죽이 마당에 생겼어요!`);
        } else {
          const before = ctx.store.get().tasks.find((t) => t.id === form.dataset.id)!;
          ctx.store.updateTask(form.dataset.id!, values);
          if (values.dueAt > before.dueAt) ctx.toast('📅 마감을 미뤘어요. 미룬 횟수는 동네 친구들에게 보여요.');
          editingId = null;
          render(ctx.store.get());
        }
      } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
      }
    });

    render(ctx.store.get());
    return ctx.store.subscribe((s) => render(s));
  },
};

function taskSlot(t: Task, state: GameState): string {
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
      <div class="meta">${formatDate(t.startAt)} → ${formatDate(t.dueAt)} · 진행 ${Math.round(ratio * 100)}% · 집중 ${t.focusMinutes}분</div>
      <div class="actions">
        <button class="px-btn small ${focusing ? 'red' : 'green'}" data-act="focus" data-id="${t.id}">${focusing ? '집중 끝내기' : '🔥 집중'}</button>
        <button class="px-btn small" data-act="done" data-id="${t.id}">완료!</button>
        <button class="px-btn small ghost" data-act="edit" data-id="${t.id}">수정</button>
      </div>
    </div>`;
}

function editSlot(t: Task): string {
  return `<form class="slot edit" data-id="${t.id}">${taskFormFields(t.startAt, t.dueAt, t.title)}
    <div class="meta">마감을 뒤로 미루면 "마감 연장"으로 기록돼요.</div>
    <div class="actions"><button class="px-btn small green">저장</button><button type="button" class="px-btn small ghost" data-act="cancel-edit">취소</button></div>
    <p class="form-error" hidden></p></form>`;
}

function taskFormFields(startAt: number, dueAt: number, title: string): string {
  return `<div class="form-grid">
    <input class="px-input full" name="title" placeholder="할 일 (예: 보고서 쓰기)" maxlength="40" required value="${escapeHtml(title)}" />
    <label>시작</label><input class="px-input" name="start" type="datetime-local" required value="${toLocalInput(startAt)}" />
    <label>마감</label><input class="px-input" name="due" type="datetime-local" required value="${toLocalInput(dueAt)}" />
  </div>`;
}

function readTaskForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') ?? ''),
    startAt: fromLocalInput(String(data.get('start'))),
    dueAt: fromLocalInput(String(data.get('due'))),
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

    body.innerHTML = `
      <div class="cal-layout">
        <div>
          <div class="cal-head">
            <button class="px-btn small ghost" data-act="prev">◀</button>
            <strong class="title"></strong>
            <button class="px-btn small ghost" data-act="next">▶</button>
            <button class="px-btn small ghost" data-act="today">오늘</button>
          </div>
          <div class="cal-grid"></div>
        </div>
        <div>
          <h3 class="day-title"></h3>
          <div class="day-list"></div>
          <h3>이 날 할 일 추가</h3>
          <form class="add slot">
            <input class="px-input" name="title" placeholder="할 일" maxlength="40" required style="width:100%;box-sizing:border-box" />
            <div class="meta">시작 <input class="px-input" name="start" type="time" value="09:00" /> 마감 <input class="px-input" name="due" type="time" value="18:00" /></div>
            <div class="actions"><button class="px-btn small green">반죽 만들기</button></div>
            <p class="form-error" hidden></p>
          </form>
        </div>
      </div>`;
    const grid = body.querySelector<HTMLElement>('.cal-grid')!;

    const render = (state: GameState) => {
      body.querySelector('.title')!.textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
      const first = new Date(month);
      first.setDate(1 - first.getDay());
      let html = WEEKDAYS.map((w) => `<div class="wd">${w}</div>`).join('');
      for (let i = 0; i < 42; i++) {
        const day = new Date(first); day.setDate(first.getDate() + i);
        const dayStart = day.getTime();
        const items = tasksOnDay(state.tasks, dayStart);
        const chips = items.slice(0, 2).map(({ task, isDue }) =>
          `<div class="cal-chip ${task.completedAt !== undefined ? 'done' : isDue ? 'due' : ''}">${isDue ? '📌' : ''}${escapeHtml(task.title)}</div>`).join('');
        const more = items.length > 2 ? `<div class="cal-more">+${items.length - 2}</div>` : '';
        const cls = ['cal-day', day.getMonth() !== month.getMonth() ? 'other' : '', dayStart === today ? 'today' : '', dayStart === selected ? 'selected' : ''].join(' ');
        html += `<button class="${cls}" data-day="${dayStart}"><span class="num">${day.getDate()}</span>${chips}${more}</button>`;
      }
      grid.innerHTML = html;

      const d = new Date(selected);
      body.querySelector('.day-title')!.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
      const items = tasksOnDay(state.tasks, selected);
      body.querySelector('.day-list')!.innerHTML = items.length
        ? items.map(({ task, isDue }) => `<div class="slot"><div class="row"><span class="grow">${task.completedAt !== undefined ? '✅ ' : ''}${escapeHtml(task.title)}</span>${isDue ? '<span class="badge warn">마감</span>' : ''}</div><div class="meta">${formatDate(task.startAt)} → ${formatDate(task.dueAt)}</div></div>`).join('')
        : '<div class="empty">이 날은 할 일이 없어요.</div>';
    };

    body.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-day]');
      if (!el) return;
      if (el.dataset.day) selected = Number(el.dataset.day);
      else if (el.dataset.act === 'prev') month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      else if (el.dataset.act === 'next') month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      else if (el.dataset.act === 'today') { month = new Date(today); month.setDate(1); selected = today; }
      render(ctx.store.get());
    });

    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const data = new FormData(form);
      const at = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return selected + (h * 60 + m) * 60 * 1000; };
      const error = form.querySelector<HTMLElement>('.form-error')!;
      try {
        const title = String(data.get('title'));
        ctx.store.addTask(title, at(String(data.get('start'))), at(String(data.get('due'))));
        (form.elements.namedItem('title') as HTMLInputElement).value = '';
        error.hidden = true;
        ctx.toast(`🫧 "${title.trim()}" 반죽이 마당에 생겼어요!`);
      } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
      }
    });

    render(ctx.store.get());
    return ctx.store.subscribe((s) => render(s));
  },
};

/** 이 날짜에 걸쳐 있는 할 일 (시작~마감 사이) */
function tasksOnDay(tasks: Task[], dayStart: number): { task: Task; isDue: boolean }[] {
  const dayEnd = dayStart + DAY;
  return tasks
    .filter((t) => t.startAt < dayEnd && (t.completedAt ?? t.dueAt) >= dayStart)
    .map((task) => ({ task, isDue: task.dueAt >= dayStart && task.dueAt < dayEnd }))
    .sort((a, b) => Number(b.isDue) - Number(a.isDue) || a.task.dueAt - b.task.dueAt);
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
          const count = met.get(c.id) ?? 0;
          const lockedHabit = c.unlock && state.unlocks[c.unlock] === undefined ? HABIT_TEXT[c.unlock].name : '';
          return `<div class="dex-card ${count ? '' : 'locked'}">
            <img src="${ctx.characterDir}${c.image}" alt="" />
            <div class="name">${count ? escapeHtml(c.name) : '???'}</div>
            <div class="sub">${count ? `${count}마리 · ${escapeHtml(c.personality ?? '')}` : lockedHabit ? `🔒 ${lockedHabit}` : '아직 못 만났어요'}</div>
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
      body.innerHTML = `<p class="muted" style="margin:0 0 8px">마당에 사는 주민 ${residents.length}명</p>` + residents.map((r) => {
        const species = catalog.find((c) => c.id === r.speciesId);
        const name = r.nickname ?? species?.name ?? RESIDENT_TEXT[r.kind];
        const img = species ? `<img src="${ctx.characterDir}${species.image}" alt="" style="width:48px;height:54px;image-rendering:pixelated" />` : `<span style="font-size:28px;width:48px;text-align:center">${RESIDENT_TEXT[r.kind].split(' ')[0]}</span>`;
        const nameCell = r.id === renamingId
          ? `<form class="rename row" data-id="${r.id}"><input class="px-input" name="nickname" maxlength="12" value="${escapeHtml(r.nickname ?? '')}" placeholder="별명" /><button class="px-btn small green">저장</button></form>`
          : `<strong class="grow">${escapeHtml(name)}</strong><button class="px-btn small ghost" data-act="rename" data-id="${r.id}">별명</button>`;
        return `<div class="slot"><div class="row">${img}<div class="grow"><div class="row">${nameCell}</div>
          <div class="meta">${residentKindText(r)}${species && r.nickname ? ` · ${escapeHtml(species.name)}` : ''} · "${escapeHtml(r.fromTask)}" 끝내고 ${formatDate(r.bornAt)} 탄생</div></div></div></div>`;
      }).join('');
    };
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

export const WINDOWS: GameWindow[] = [tasksWindow, calendarWindow, dexWindow, residentsWindow];
