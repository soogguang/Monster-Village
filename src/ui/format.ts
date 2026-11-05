// 여러 창에서 같이 쓰는 글자·날짜 도우미

import { FRIENDSHIP, HABITS } from '../config';
import type { HabitId } from '../rules/habits';
import type { DoughStage, ResidentKind } from '../rules/task';

export const DAY = 24 * 60 * 60 * 1000;

export const STAGE_TEXT: Record<DoughStage, string> = { soft: '🫧 말랑', grumpy: '😤 심술', monster: '👾 몬스터' };
export const RESIDENT_TEXT: Record<ResidentKind, string> = { sprout: '🌱 새싹', sleepy: '😴 꾸벅이', trouble: '😈 말썽' };
export const HABIT_TEXT: Record<HabitId, { name: string; how: string }> = {
  'many-done': { name: '📦 차곡차곡 해내기', how: `하루에 서로 다른 할 일 ${HABITS.manyDoneCount}개 완료` },
  'rest-and-return': {
    name: '☕ 쉬고 돌아오기',
    how: `${HABITS.restAndReturnFocusMinutes}분 집중 → 짧은 휴식(앞 집중의 1/${HABITS.focusToRestRatio} 이하) → 다시 ${HABITS.restAndReturnFocusMinutes}분`,
  },
  'deep-focus': { name: '🎯 푹 몰입하기', how: `끊지 않고 ${HABITS.deepFocusMinutes}분 집중` },
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatClock(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return { date: `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = pad(Math.floor((s % 3600) / 60));
  const ss = pad(s % 60);
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** <input type="datetime-local">에 넣을 값 */
export function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

/** 친밀도 표시: ♥♥♥♡♡♡ (진화 단계까지), 넘으면 숫자를 덧붙여요 */
export function heartsText(hearts: number): string {
  const max = FRIENDSHIP.evolveHearts;
  const filled = Math.min(hearts, max);
  return '♥'.repeat(filled) + '♡'.repeat(max - filled) + (hearts > max ? ` +${hearts - max}` : '');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export { WEEKDAYS };
