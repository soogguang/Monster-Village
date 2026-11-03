// 게임 데이터 저장소
// 지금은 브라우저(localStorage)에 임시로 저장해요. Supabase를 연결하면 Storage 구현만 바꿔요.

import { pickResident, type CatalogEntry } from './rules/catalog';
import { HABIT_IDS, achievedHabits, type FocusSession, type HabitId } from './rules/habits';
import { addFocus, createTask, decideResident, extendDue, type ResidentKind, type Task } from './rules/task';

export interface Resident {
  id: string;
  kind: ResidentKind;
  rare: boolean;
  /** catalog.json의 캐릭터 id. 아직 그림이 없으면 null (임시 그림으로 보여줘요) */
  speciesId: string | null;
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

  addTask(title: string, startAt: number, dueAt: number): Task {
    const task = createTask({ id: newId(), title: title.trim(), startAt, dueAt });
    this.set({ ...this.state, tasks: [...this.state.tasks, task] });
    return task;
  }

  extendTask(taskId: string, newDueAt: number): void {
    this.set({ ...this.state, tasks: this.state.tasks.map((t) => (t.id === taskId ? extendDue(t, newDueAt) : t)) });
  }

  startFocus(taskId: string): HabitId[] {
    const newUnlocks = this.state.focus ? this.stopFocus() : [];
    this.set({ ...this.state, focus: { taskId, startedAt: this.now() } });
    return newUnlocks;
  }

  /** 집중을 끝내고 기록을 남겨요. 이번에 새로 해금된 습관을 돌려줘요. */
  stopFocus(): HabitId[] {
    const focus = this.state.focus;
    if (!focus) return [];
    const session: FocusSession = { taskId: focus.taskId, startedAt: focus.startedAt, endedAt: this.now() };
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

function newId(): string {
  return crypto.randomUUID();
}
