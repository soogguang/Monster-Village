// 집중 습관 판정: 집중 기록과 완료 기록을 보고 어떤 습관을 달성했는지 알려줘요.

import { HABITS } from '../config';

export type HabitId = 'deep-focus' | 'rest-and-return' | 'many-done';

export const HABIT_IDS: HabitId[] = ['many-done', 'rest-and-return', 'deep-focus'];

export interface FocusSession {
  taskId: string;
  startedAt: number;
  endedAt: number;
}

export interface Completion {
  taskId: string;
  completedAt: number;
}

const MINUTE = 60 * 1000;

const minutes = (s: FocusSession) => (s.endedAt - s.startedAt) / MINUTE;

/** 푹 몰입하기: 끊지 않고 50분 이상 집중한 적이 있나요? */
export function hasDeepFocus(sessions: FocusSession[]): boolean {
  return sessions.some((s) => minutes(s) >= HABITS.deepFocusMinutes);
}

/**
 * 쉬고 돌아오기: 25분 이상 집중 → 휴식 → 다시 25분 이상 집중한 적이 있나요?
 * 휴식은 1분 이상, 바로 앞 집중 시간의 1/5 이하예요. 앞뒤 할 일은 달라도 돼요.
 */
export function hasRestAndReturn(sessions: FocusSession[]): boolean {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1];
    const after = sorted[i];
    const rest = (after.startedAt - before.endedAt) / MINUTE;
    if (
      minutes(before) >= HABITS.restAndReturnFocusMinutes &&
      minutes(after) >= HABITS.restAndReturnFocusMinutes &&
      rest >= HABITS.restMinMinutes &&
      rest <= minutes(before) / HABITS.focusToRestRatio
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 차곡차곡 해내기: 하루에 서로 다른 할 일 3개를 끝낸 적이 있나요?
 * dayKey는 시각을 "날짜"로 바꿔요. 기본값은 이 브라우저의 시간대 기준 자정이에요.
 */
export function hasManyDone(completions: Completion[], dayKey: (ms: number) => string = localDayKey): boolean {
  const byDay = new Map<string, Set<string>>();
  for (const c of completions) {
    const key = dayKey(c.completedAt);
    const tasks = byDay.get(key) ?? new Set<string>();
    tasks.add(c.taskId);
    byDay.set(key, tasks);
    if (tasks.size >= HABITS.manyDoneCount) return true;
  }
  return false;
}

/** 지금까지의 기록으로 달성한 습관 목록 */
export function achievedHabits(
  sessions: FocusSession[],
  completions: Completion[],
  dayKey: (ms: number) => string = localDayKey,
): Set<HabitId> {
  const done = new Set<HabitId>();
  if (hasDeepFocus(sessions)) done.add('deep-focus');
  if (hasRestAndReturn(sessions)) done.add('rest-and-return');
  if (hasManyDone(completions, dayKey)) done.add('many-done');
  return done;
}

/** 이 브라우저 시간대 기준의 날짜 이름 (예: 2026-11-4) */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---------------------------------------------------------------- 하루 집중 시간

/** 그날 0시와 다음 날 0시 (내 시간대 기준) */
export function localDayRange(ms: number): { from: number; to: number } {
  const d = new Date(ms);
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return { from, to };
}

/**
 * 구간(from~to) 안에서 할 일마다 집중한 시간(ms). 구간을 걸친 집중은 안쪽만 세요. (예: 밤 11시~새벽 1시면 하루에 1시간씩)
 * 지금 집중 중이면(ongoing) 지금까지의 시간도 더해요.
 */
export function focusByTask(
  sessions: FocusSession[],
  from: number,
  to: number,
  ongoing?: { taskId: string; startedAt: number } | null,
  now = Date.now(),
): Map<string, number> {
  const all = ongoing ? [...sessions, { taskId: ongoing.taskId, startedAt: ongoing.startedAt, endedAt: now }] : sessions;
  const byTask = new Map<string, number>();
  for (const s of all) {
    const ms = Math.min(s.endedAt, to) - Math.max(s.startedAt, from);
    if (ms > 0) byTask.set(s.taskId, (byTask.get(s.taskId) ?? 0) + ms);
  }
  return byTask;
}

/** 구간(from~to) 안에서 집중한 시간 합(ms) */
export function focusTotal(...args: Parameters<typeof focusByTask>): number {
  let total = 0;
  for (const ms of focusByTask(...args).values()) total += ms;
  return total;
}
