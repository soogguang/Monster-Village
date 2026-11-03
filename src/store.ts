// 게임 데이터 저장소
// 지금은 브라우저(localStorage)에 임시로 저장해요. Supabase를 연결하면 Storage 구현만 바꿔요.

import { addFocus, createTask, decideResident, extendDue, type ResidentKind, type Task } from './rules/task';

export interface Resident {
  id: string;
  kind: ResidentKind;
  rare: boolean;
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
}

export interface Storage {
  load(): GameState | null;
  save(state: GameState): void;
}

const EMPTY: GameState = { tasks: [], residents: [], focus: null };
const MINUTE = 60 * 1000;

export class GameStore {
  private state: GameState;
  private listeners = new Set<(s: GameState) => void>();

  constructor(
    private storage: Storage,
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
  ) {
    this.state = storage.load() ?? EMPTY;
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
    this.updateTask(taskId, (t) => extendDue(t, newDueAt));
  }

  startFocus(taskId: string): void {
    if (this.state.focus) this.stopFocus();
    this.set({ ...this.state, focus: { taskId, startedAt: this.now() } });
  }

  /** 집중을 끝내고, 집중한 시간(분)을 할 일에 쌓아요. */
  stopFocus(): void {
    const focus = this.state.focus;
    if (!focus) return;
    const minutes = Math.floor((this.now() - focus.startedAt) / MINUTE);
    const tasks = this.state.tasks.map((t) => (t.id === focus.taskId ? addFocus(t, minutes) : t));
    this.set({ ...this.state, tasks, focus: null });
  }

  /** 할 일을 끝내면 주민이 태어나요. 태어난 주민을 돌려줘요. */
  completeTask(taskId: string): Resident {
    if (this.state.focus?.taskId === taskId) this.stopFocus();
    const task = this.state.tasks.find((t) => t.id === taskId && t.completedAt === undefined);
    if (!task) throw new Error('끝낼 수 있는 할 일이 아니에요.');

    const completedAt = this.now();
    const result = decideResident(task, completedAt, this.rng);
    const resident: Resident = { id: newId(), ...result, fromTask: task.title, bornAt: completedAt };
    this.set({
      ...this.state,
      tasks: this.state.tasks.map((t) => (t.id === taskId ? { ...t, completedAt } : t)),
      residents: [...this.state.residents, resident],
    });
    return resident;
  }

  private updateTask(taskId: string, fn: (t: Task) => Task): void {
    this.set({ ...this.state, tasks: this.state.tasks.map((t) => (t.id === taskId ? fn(t) : t)) });
  }

  private set(next: GameState): void {
    this.state = next;
    this.storage.save(next);
    for (const fn of this.listeners) fn(next);
  }
}

export class LocalStorage implements Storage {
  constructor(private key = 'monster-village:v1') {}

  load(): GameState | null {
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as GameState) : null;
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
