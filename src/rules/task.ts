// 게임 규칙: 화면 코드와 분리된 순수 함수들이에요.
// 시간은 모두 밀리초 단위 타임스탬프(Date.getTime())로 다뤄요.

import { RULES } from '../config';

export interface Task {
  id: string;
  title: string;
  startAt: number;
  dueAt: number;
  /** 지금까지 집중한 총 시간(분) */
  focusMinutes: number;
  /** 처음으로 (1분 이상) 집중을 시작한 시각. 심술이 굳었는지 판단해요. 집중한 적 없으면 없음 */
  firstFocusAt?: number;
  /** 마감일을 미룬 횟수 (동네 친구들에게 보여요) */
  dueExtensions: number;
  completedAt?: number;
  /** 달력에 보이는 방식: 마감일에만 표시(due) 또는 시작~마감 기간 막대(range). 예전 데이터는 없을 수 있어요. */
  calendarStyle?: CalendarStyle;
  /** 달력·목록에서 쓰는 색. 예전 데이터는 없을 수 있어요(기본 하늘색) */
  color?: TaskColor;
}

export type CalendarStyle = 'due' | 'range';

/** 할 일마다 고를 수 있는 색 */
export const TASK_COLORS = ['sky', 'leaf', 'yellow', 'orange', 'pink', 'purple', 'brown', 'gray'] as const;
export type TaskColor = (typeof TASK_COLORS)[number];
export const DEFAULT_TASK_COLOR: TaskColor = 'sky';

export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && (TASK_COLORS as readonly string[]).includes(value);
}

/** 반죽 단계: 말랑 반죽 → 심술 반죽 → 몬스터 반죽 */
export type DoughStage = 'soft' | 'grumpy' | 'monster';

export type ResidentKind = 'sprout' | 'sleepy' | 'trouble';

export interface ResidentResult {
  kind: ResidentKind;
  rare: boolean;
}

export function createTask(
  input: Pick<Task, 'id' | 'title' | 'startAt' | 'dueAt'> & { calendarStyle?: CalendarStyle; color?: TaskColor },
): Task {
  assertValidPeriod(input.startAt, input.dueAt);
  return { calendarStyle: 'due', color: DEFAULT_TASK_COLOR, ...input, focusMinutes: 0, dueExtensions: 0 };
}

/**
 * 진행 비율 = (시점 − 시작일) ÷ (마감일 − 시작일)
 * 시작일 전에 끝내면 0, 마감을 넘기면 1보다 커져요.
 * 시간 단위까지 계산하므로 같은 날 안의 할 일도 그대로 비교할 수 있어요.
 */
export function progressRatio(task: Pick<Task, 'startAt' | 'dueAt'>, at: number): number {
  const ratio = (at - task.startAt) / (task.dueAt - task.startAt);
  return Math.max(0, ratio);
}

/** 기간 중 비율 지점의 시각 (예: 0.5 → 기간의 절반 지점) */
function pointAt(task: Pick<Task, 'startAt' | 'dueAt'>, ratio: number): number {
  return task.startAt + (task.dueAt - task.startAt) * ratio;
}

/** 심술이 굳기 전(기간의 75%)에 한 번이라도 집중했는지 */
function helpedInTime(task: Task): boolean {
  return task.firstFocusAt !== undefined && task.firstFocusAt < pointAt(task, RULES.grumpyStuckRatio);
}

/**
 * 지금 이 순간 반죽이 어떤 단계인지 알려줘요.
 * - 말랑: 기간의 50%까지는 집중 안 해도 말랑. 그 전에 한 번이라도 집중했으면 마감 전까지 계속 말랑
 * - 심술: 50%가 지나도 한 번도 집중 안 함. 75% 전에 집중하면 다시 말랑
 * - 굳은 심술: 75%까지 한 번도 집중 안 함. 그 뒤에 집중해도 계속 심술 (isStuckGrumpy)
 * - 몬스터 반죽: 마감이 지남
 */
export function doughStage(task: Task, now: number): DoughStage {
  if (now > task.dueAt) return 'monster';
  if (helpedInTime(task)) return 'soft';
  return now > pointAt(task, RULES.grumpyGraceRatio) ? 'grumpy' : 'soft';
}

/** 심술 반죽이었던 적이 있는지 (기간의 50%가 지나서야 처음 집중했어요) */
function wasGrumpy(task: Task): boolean {
  return task.firstFocusAt === undefined || task.firstFocusAt > pointAt(task, RULES.grumpyGraceRatio);
}

/** 굳은 심술: 기간의 75%가 될 때까지 한 번도 집중하지 않았어요. 이제 집중해도 말랑으로 돌아가지 않아요. */
export function isStuckGrumpy(task: Task, now: number): boolean {
  return now >= pointAt(task, RULES.grumpyStuckRatio) && !helpedInTime(task);
}

/** 할 일을 끝낸 순간 어떤 주민이 태어나는지 정해요. rng는 0 이상 1 미만의 난수를 돌려줘요. */
export function decideResident(
  task: Task,
  completedAt: number,
  rng: () => number = Math.random,
): ResidentResult {
  const ratio = progressRatio(task, completedAt);

  // 마감이 지나 몬스터 반죽이 됐으면 말썽
  if (completedAt > task.dueAt) return { kind: 'trouble', rare: false };
  // 늦게(75% 이후) 끝냈으면 반죽이 지나온 길에 따라 (희귀는 일찍 끝냈을 때만이라 없어요)
  // - 굳은 심술: 말썽 / 심술에서 풀림(50~75% 사이에 처음 집중): 꾸벅이 / 처음부터 말랑(50% 전에 집중): 새싹
  if (ratio >= RULES.lateRatio) {
    if (isStuckGrumpy(task, completedAt)) return { kind: 'trouble', rare: false };
    return { kind: wasGrumpy(task) ? 'sleepy' : 'sprout', rare: false };
  }

  const rareChance =
    ratio <= RULES.veryEarlyRatio ? RULES.rareChanceVeryEarly : RULES.rareChanceEarly;
  return { kind: 'sprout', rare: rng() < rareChance };
}

/** 집중 시간을 더해요. startedAt을 주면 처음 집중한 시각(firstFocusAt)도 기록해요. */
export function addFocus(task: Task, minutes: number, startedAt?: number): Task {
  if (minutes <= 0) return task;
  const firstFocusAt = startedAt === undefined ? task.firstFocusAt : Math.min(task.firstFocusAt ?? startedAt, startedAt);
  return { ...task, focusMinutes: task.focusMinutes + minutes, ...(firstFocusAt !== undefined ? { firstFocusAt } : {}) };
}

/** 마감일을 미뤄요. 미룬 횟수가 기록돼요. */
export function extendDue(task: Task, newDueAt: number): Task {
  if (newDueAt <= task.dueAt) {
    throw new Error('새 마감일은 기존 마감일보다 뒤여야 해요.');
  }
  return { ...task, dueAt: newDueAt, dueExtensions: task.dueExtensions + 1 };
}

function assertValidPeriod(startAt: number, dueAt: number): void {
  if (!(dueAt > startAt)) {
    throw new Error('마감일은 시작일보다 뒤여야 해요.');
  }
}
