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

/** 반죽 단계: 말랑 반죽 → 심술 반죽 → 찐 몬스터 */
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

/** 지금 이 순간 반죽이 어떤 단계인지 알려줘요. */
export function doughStage(task: Task, now: number): DoughStage {
  if (now > task.dueAt) return 'monster';
  // 시작하자마자 심술이 나지 않도록 여유 시간을 줘요: 기간의 20% (최대값 없음)
  const grace = (task.dueAt - task.startAt) * RULES.grumpyGraceRatio;
  const graceEnds = task.startAt + grace;
  if (now > graceEnds && task.focusMinutes === 0) return 'grumpy';
  return 'soft';
}

/** 할 일을 끝낸 순간 어떤 주민이 태어나는지 정해요. rng는 0 이상 1 미만의 난수를 돌려줘요. */
export function decideResident(
  task: Task,
  completedAt: number,
  rng: () => number = Math.random,
): ResidentResult {
  const ratio = progressRatio(task, completedAt);

  if (ratio >= RULES.lateRatio) {
    const focused = task.focusMinutes >= RULES.focusMinutesForSleepy;
    return { kind: focused ? 'sleepy' : 'trouble', rare: false };
  }

  const rareChance =
    ratio <= RULES.veryEarlyRatio ? RULES.rareChanceVeryEarly : RULES.rareChanceEarly;
  return { kind: 'sprout', rare: rng() < rareChance };
}

export function addFocus(task: Task, minutes: number): Task {
  if (minutes <= 0) return task;
  return { ...task, focusMinutes: task.focusMinutes + minutes };
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
