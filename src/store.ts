// 게임 데이터 저장소
// 지금은 브라우저(localStorage)에 임시로 저장해요. Supabase를 연결하면 Storage 구현만 바꿔요.

import { pickResident, type CatalogEntry } from './rules/catalog';
import { HABIT_IDS, achievedHabits, localDayKey, type FocusSession, type HabitId } from './rules/habits';
import { addFocus, createTask, decideResident, extendDue, type CalendarStyle, type ResidentKind, type Task } from './rules/task';

export interface Resident {
  id: string;
  kind: ResidentKind;
  rare: boolean;
  /** catalog.json의 캐릭터 id. 아직 그림이 없으면 null (임시 그림으로 보여줘요) */
  speciesId: string | null;
  /** 사용자가 붙인 별명 (없으면 캐릭터 이름으로 보여요) */
  nickname?: string;
  /** 이 주민을 태어나게 한 할 일 제목 */
  fromTask: string;
  bornAt: number;
}

export interface Focus {
  taskId: string;
  startedAt: number;
}

export interface GameState {
  tasks: Task[];
  residents: Resident[];
  focus: Focus | null;
  /** 집중 기록 (습관 판정에 써요) */
  sessions: FocusSession[];
  /** 해금한 습관과 해금한 시각 */
  unlocks: Partial<Record<HabitId, number>>;
  /** 날짜별로 "오늘 할 일"로 가져온 할 일 id (날짜 이름은 localDayKey) */
  plans: Record<string, string[]>;
  /** 게임 창이 마지막으로 연결돼 있던 시각 (집중 자동 종료에 써요) */
  lastSeenAt: number | null;
}

export interface Storage {
  load(): Partial<GameState> | null;
  save(state: GameState): void;
}

/** 할 일을 끝냈을 때의 결과: 태어난 주민과, 이번에 새로 해금된 습관 */
export interface CompleteResult {
  resident: Resident;
  species: CatalogEntry | null;
  newUnlocks: HabitId[];
}

const MINUTE = 60 * 1000;
/** 연결이 이만큼 끊기면 집중이 끝난 것으로 봐요 */
export const DISCONNECT_LIMIT_MS = 5 * MINUTE;

export class GameStore {
  private state: GameState;
  private catalog: CatalogEntry[] = [];
  private listeners = new Set<(s: GameState) => void>();

  constructor(
    private storage: Storage,
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
  ) {
    const saved = storage.load();
    // 예전 형식으로 저장된 데이터에는 집중 기록과 해금이 없어서 빈 값으로 채워요.
    this.state = {
      tasks: saved?.tasks ?? [],
      residents: (saved?.residents ?? []).map((r) => ({ ...r, speciesId: r.speciesId ?? null })),
      focus: saved?.focus ?? null,
      sessions: saved?.sessions ?? [],
      unlocks: saved?.unlocks ?? {},
      plans: saved?.plans ?? {},
      lastSeenAt: saved?.lastSeenAt ?? null,
    };
  }

  setCatalog(catalog: CatalogEntry[]): void {
    this.catalog = catalog;
    this.emit();
  }

  getCatalog(): CatalogEntry[] {
    return this.catalog;
  }

  get(): GameState {
    return this.state;
  }

  subscribe(fn: (s: GameState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  addTask(title: string, startAt: number, dueAt: number, calendarStyle: CalendarStyle = 'due'): Task {
    if (!title.trim()) throw new Error('제목을 적어 주세요.');
    const task = createTask({ id: newId(), title: title.trim(), startAt, dueAt, calendarStyle });
    this.set({ ...this.state, tasks: [...this.state.tasks, task] });
    return task;
  }

  extendTask(taskId: string, newDueAt: number): void {
    this.set({ ...this.state, tasks: this.state.tasks.map((t) => (t.id === taskId ? extendDue(t, newDueAt) : t)) });
  }

  /**
   * 할 일의 제목과 날짜를 고쳐요.
   * 마감일을 뒤로 미루면 "마감 연장"으로 기록돼요. (꼼수 방지 규칙) 앞당기는 건 기록하지 않아요.
   */
  updateTask(taskId: string, changes: { title: string; startAt: number; dueAt: number; calendarStyle?: CalendarStyle }): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('없는 할 일이에요.');
    if (task.completedAt !== undefined) throw new Error('끝낸 할 일은 고칠 수 없어요.');
    const title = changes.title.trim();
    if (!title) throw new Error('제목을 적어 주세요.');
    if (!(changes.dueAt > changes.startAt)) throw new Error('마감일은 시작일보다 뒤여야 해요.');
    const extended = changes.dueAt > task.dueAt;
    const next: Task = {
      ...task,
      title,
      startAt: changes.startAt,
      dueAt: changes.dueAt,
      calendarStyle: changes.calendarStyle ?? task.calendarStyle ?? 'due',
      dueExtensions: task.dueExtensions + (extended ? 1 : 0),
    };
    this.set({ ...this.state, tasks: this.state.tasks.map((t) => (t.id === taskId ? next : t)) });
  }

  // ---------- 오늘 할 일 (하루 계획) ----------

  /** 오늘 하기로 가져온 할 일 (끝낸 것 포함, 가져온 순서대로) */
  todayPlan(): Task[] {
    const ids = this.state.plans[localDayKey(this.now())] ?? [];
    return ids.map((id) => this.state.tasks.find((t) => t.id === id)).filter((t): t is Task => t !== undefined);
  }

  /** 오늘 가져올 수 있는 할 일: 시작일이 오늘까지 지났고(기간 중이거나 마감이 지남) 아직 안 끝났고, 아직 안 가져온 일 */
  todayCandidates(): Task[] {
    const now = this.now();
    const endOfToday = startOfLocalDay(now) + 24 * 60 * MINUTE;
    const planned = new Set(this.state.plans[localDayKey(now)] ?? []);
    return this.state.tasks
      .filter((t) => t.completedAt === undefined && t.startAt < endOfToday && !planned.has(t.id))
      .sort((a, b) => a.dueAt - b.dueAt);
  }

  addToToday(taskIds: string[]): void {
    const key = localDayKey(this.now());
    const current = this.state.plans[key] ?? [];
    const next = [...current, ...taskIds.filter((id) => !current.includes(id))];
    this.set({ ...this.state, plans: { ...this.state.plans, [key]: next } });
  }

  removeFromToday(taskId: string): void {
    const key = localDayKey(this.now());
    this.set({ ...this.state, plans: { ...this.state.plans, [key]: (this.state.plans[key] ?? []).filter((id) => id !== taskId) } });
  }

  /** 오늘만 할 일: 지금부터 오늘 자정 전까지 하는 할 일을 만들고 바로 오늘 할 일에 넣어요. */
  addTodayOnlyTask(title: string): Task {
    const now = this.now();
    const task = this.addTask(title, now, startOfLocalDay(now) + 24 * 60 * MINUTE - MINUTE, 'due');
    this.addToToday([task.id]);
    return task;
  }

  // ---------- 연결 신호 ----------

  /**
   * 게임 창이 열려 있는 동안 주기적으로 불러요.
   * 마지막 신호에서 5분 넘게 끊겼다면(창을 닫았거나 노트북이 잠들었거나) 집중을 마지막 신호 시각에 끝내요.
   * 이렇게 끝낸 경우 그 시각과 해금 결과를 돌려줘요.
   */
  heartbeat(): { endedAt: number; newUnlocks: HabitId[] } | null {
    const now = this.now();
    const last = this.state.lastSeenAt;
    let ended: { endedAt: number; newUnlocks: HabitId[] } | null = null;
    if (this.state.focus && last !== null && now - last > DISCONNECT_LIMIT_MS) {
      ended = { endedAt: last, newUnlocks: this.stopFocus(last) };
    }
    // 신호 시각만 바뀐 건 화면을 다시 그릴 필요가 없어서 조용히 저장만 해요.
    this.state = { ...this.state, lastSeenAt: now };
    this.storage.save(this.state);
    return ended;
  }

  renameResident(residentId: string, nickname: string): void {
    const name = nickname.trim().slice(0, 12);
    this.set({
      ...this.state,
      residents: this.state.residents.map((r) => (r.id === residentId ? { ...r, nickname: name || undefined } : r)),
    });
  }

  startFocus(taskId: string): HabitId[] {
    const newUnlocks = this.state.focus ? this.stopFocus() : [];
    this.set({ ...this.state, focus: { taskId, startedAt: this.now() } });
    return newUnlocks;
  }

  /** 집중을 끝내고 기록을 남겨요. 이번에 새로 해금된 습관을 돌려줘요. endedAt을 주면 그 시각에 끝난 것으로 기록해요. */
  stopFocus(endedAt: number = this.now()): HabitId[] {
    const focus = this.state.focus;
    if (!focus) return [];
    const session: FocusSession = { taskId: focus.taskId, startedAt: focus.startedAt, endedAt: Math.max(focus.startedAt, endedAt) };
    const minutes = Math.floor((session.endedAt - session.startedAt) / MINUTE);
    const tasks = this.state.tasks.map((t) => (t.id === focus.taskId ? addFocus(t, minutes) : t));
    const sessions = session.endedAt > session.startedAt ? [...this.state.sessions, session] : this.state.sessions;
    const { unlocks, newUnlocks } = this.checkUnlocks(tasks, sessions);
    this.set({ ...this.state, tasks, sessions, unlocks, focus: null });
    return newUnlocks;
  }

  /** 할 일을 끝내면 주민이 태어나요. 습관 해금을 먼저 확인해서, 방금 해금된 주민도 후보에 들어가요. */
  completeTask(taskId: string): CompleteResult {
    const focusUnlocks = this.state.focus?.taskId === taskId ? this.stopFocus() : [];
    const task = this.state.tasks.find((t) => t.id === taskId && t.completedAt === undefined);
    if (!task) throw new Error('끝낼 수 있는 할 일이 아니에요.');

    const completedAt = this.now();
    const tasks = this.state.tasks.map((t) => (t.id === taskId ? { ...t, completedAt } : t));
    const { unlocks, newUnlocks } = this.checkUnlocks(tasks, this.state.sessions);

    const result = decideResident(task, completedAt, this.rng);
    const unlocked = new Set(Object.keys(unlocks) as HabitId[]);
    const species = pickResident(this.catalog, result, unlocked, this.rng);
    const resident: Resident = {
      id: newId(),
      kind: result.kind,
      // 희귀 후보가 없어서 일반 새싹이 나왔다면 일반 새싹으로 기록해요. (그림이 아직 없으면 판정 그대로)
      rare: species ? species.rare : result.rare,
      speciesId: species?.id ?? null,
      fromTask: task.title,
      bornAt: completedAt,
    };
    this.set({ ...this.state, tasks, unlocks, residents: [...this.state.residents, resident] });
    return { resident, species, newUnlocks: [...focusUnlocks, ...newUnlocks] };
  }

  private checkUnlocks(tasks: Task[], sessions: FocusSession[]) {
    const completions = tasks.flatMap((t) => (t.completedAt === undefined ? [] : [{ taskId: t.id, completedAt: t.completedAt }]));
    const achieved = achievedHabits(sessions, completions);
    const unlocks = { ...this.state.unlocks };
    const newUnlocks: HabitId[] = [];
    for (const id of HABIT_IDS) {
      if (achieved.has(id) && unlocks[id] === undefined) {
        unlocks[id] = this.now();
        newUnlocks.push(id);
      }
    }
    return { unlocks, newUnlocks };
  }

  private set(next: GameState): void {
    this.state = next;
    this.storage.save(next);
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}

export class LocalStorage implements Storage {
  constructor(private key = 'monster-village:v1') {}

  load(): Partial<GameState> | null {
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as Partial<GameState>) : null;
    } catch {
      return null;
    }
  }

  save(state: GameState): void {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(state));
    } catch {
      // 저장이 막힌 브라우저(시크릿 모드 등)에서는 이번 접속 동안만 기억해요.
    }
  }
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function newId(): string {
  return crypto.randomUUID();
}
