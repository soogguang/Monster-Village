// 달력 한 주(7칸)의 배치 계산 (화면과 무관한 순수 계산이라 테스트할 수 있어요)
// 맥 캘린더처럼 정리해요.
// - ▬ 기간 할 일: 날짜 칸을 가로지르는 막대 하나. 막대마다 줄(lane)을 하나 정해서 그 주 동안 같은 높이에 그려요.
// - 📌 마감일만: 마감일 칸에 "● 제목 시각" 한 줄. 막대가 지나가지 않는 빈 줄을 위에서부터 마감 시각 순서로 채워요.
// - 칸에 다 안 들어가면 "+N개"로 줄여요.

import { DEFAULT_TASK_COLOR, type Task, type TaskColor } from '../rules/task';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 칸 하나에 보이는 줄 수 (막대 + 한 줄 할 일). 넘치면 +N개 */
export const CALENDAR_ROWS = 3;

/** 색 이름과 화면 색 (밝은 바탕 + 진한 테두리) */
export const TASK_COLOR_STYLE: Record<TaskColor, { name: string; bg: string; edge: string }> = {
  sky: { name: '하늘', bg: '#cfe3f2', edge: '#4a8fc4' },
  leaf: { name: '풀잎', bg: '#d6ebc2', edge: '#5b9a3a' },
  yellow: { name: '노랑', bg: '#f6e7a4', edge: '#c49a1c' },
  orange: { name: '주황', bg: '#f8d4ad', edge: '#d77a25' },
  pink: { name: '분홍', bg: '#f5d0dc', edge: '#cc5680' },
  purple: { name: '보라', bg: '#e0d2ef', edge: '#8660b5' },
  brown: { name: '갈색', bg: '#e7d4bd', edge: '#8a5a33' },
  gray: { name: '회색', bg: '#e1ded6', edge: '#857f73' },
};

export function colorOf(task: Pick<Task, 'color'>): TaskColor {
  return task.color ?? DEFAULT_TASK_COLOR;
}

export interface WeekBar {
  task: Task;
  /** 이 주에서 막대가 시작·끝나는 칸 (0=일요일 … 6=토요일, 끝 칸 포함) */
  startCol: number;
  endCol: number;
  lane: number;
  /** 지난주에서 이어져 오거나 다음 주로 이어지는지 (그쪽 끝은 둥글게 닫지 않아요) */
  fromBefore: boolean;
  toAfter: boolean;
  /** 이 주 안에 마감일이 있어요 (막대 끝에 📌) */
  dueInWeek: boolean;
}

export interface DayCell {
  /** 위에서부터 줄마다: 막대가 지나가는 줄(null) 또는 그 줄에 놓인 한 줄 할 일. 빈 줄은 없어요(끝은 잘라요) */
  rows: (Task | null)[];
  /** 보여줄 한 줄 할 일 (마감 시각 순) */
  items: Task[];
  /** 칸에 안 들어가서 +N개로 줄인 수 */
  hidden: number;
}

export interface WeekLayout {
  /** 막대 (줄이 CALENDAR_ROWS를 넘는 막대는 빼고) */
  bars: WeekBar[];
  cells: DayCell[];
}

function isRange(t: Task): boolean {
  return (t.calendarStyle ?? 'due') === 'range';
}

/** 기간 막대가 끝나는 시각: 일찍 끝냈으면 끝낸 날까지만 */
function barEnd(t: Task): number {
  return Math.min(t.completedAt ?? t.dueAt, t.dueAt);
}

/** days: 그 주 7칸의 0시 시각 (일요일부터) */
export function layoutWeek(tasks: Task[], days: number[]): WeekLayout {
  const colOf = (ms: number) => {
    for (let i = days.length - 1; i >= 0; i--) if (ms >= days[i]) return i;
    return -1;
  };
  const weekStart = days[0];
  const weekEnd = days[days.length - 1] + DAY_MS;

  // 1) 기간 막대: 이 주와 겹치는 부분만. 먼저 시작하고 긴 것부터 줄을 정해요.
  const spans = tasks
    .filter((t) => isRange(t) && t.startAt < weekEnd && barEnd(t) >= weekStart)
    .map((task) => {
      const start = Math.max(task.startAt, weekStart);
      const end = Math.min(barEnd(task), weekEnd - 1);
      return { task, startCol: Math.max(0, colOf(start)), endCol: Math.max(0, colOf(end)) };
    })
    .sort((a, b) =>
      a.startCol - b.startCol ||
      (b.endCol - b.startCol) - (a.endCol - a.startCol) ||
      a.task.startAt - b.task.startAt ||
      a.task.id.localeCompare(b.task.id));

  const lanes: boolean[][] = []; // lanes[lane][col] = 차 있음
  const placed: WeekBar[] = spans.map((s) => {
    let lane = 0;
    while (lanes[lane] && lanes[lane].slice(s.startCol, s.endCol + 1).some(Boolean)) lane++;
    lanes[lane] ??= Array(7).fill(false);
    for (let c = s.startCol; c <= s.endCol; c++) lanes[lane][c] = true;
    return {
      ...s,
      lane,
      fromBefore: s.task.startAt < weekStart,
      toAfter: barEnd(s.task) >= weekEnd,
      dueInWeek: s.task.dueAt >= weekStart && s.task.dueAt < weekEnd && s.task.completedAt === undefined,
    };
  });

  // 2) 칸마다: 막대가 지나가지 않는 빈 줄을 위에서부터 한 줄 할 일(📌 마감일만)로 채워요. (마감 시각 순)
  const cells: DayCell[] = days.map((dayStart, col) => {
    const covering = placed.filter((b) => b.startCol <= col && b.endCol >= col);
    const hiddenBars = covering.filter((b) => b.lane >= CALENDAR_ROWS).length;
    const singles = tasks
      .filter((t) => !isRange(t) && t.dueAt >= dayStart && t.dueAt < dayStart + DAY_MS)
      .sort((a, b) => a.dueAt - b.dueAt || a.title.localeCompare(b.title));
    const queue = [...singles];
    const slots: (Task | 'bar' | 'empty')[] = [];
    for (let lane = 0; lane < CALENDAR_ROWS; lane++) {
      slots.push(covering.some((b) => b.lane === lane) ? 'bar' : queue.shift() ?? 'empty');
    }
    // 끝의 빈 줄은 잘라요. 막대 사이의 빈 줄은 아래 막대 자리를 지키려고 남겨요.
    while (slots.length && slots[slots.length - 1] === 'empty') slots.pop();
    const rows = slots.map((slot) => (typeof slot === 'string' ? null : slot));
    return { rows, items: rows.filter((r): r is Task => r !== null), hidden: hiddenBars + queue.length };
  });

  return { bars: placed.filter((b) => b.lane < CALENDAR_ROWS), cells };
}
