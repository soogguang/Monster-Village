// 캐릭터 목록(catalog.json)과 주민 고르기
// 목록 파일은 사용자와 Codex가 관리해요: public/assets/characters/catalog.json

import type { HabitId } from './habits';
import type { ResidentKind, ResidentResult } from './task';

export interface CatalogEntry {
  id: string;
  name: string;
  kind: ResidentKind;
  rare: boolean;
  unlock: HabitId | null;
  image: string;
  sleepImage?: string;
  personality?: string;
  motif?: string;
}

/**
 * 정해진 계열 안에서, 지금 만날 수 있는 후보 중 하나를 똑같은 확률로 골라요.
 * 후보 = 기본 주민(unlock 없음) + 해금한 주민.
 * 희귀로 정해졌는데 희귀 후보가 없으면 일반 새싹 후보에서 골라요.
 * 후보가 하나도 없으면 null (아직 그림이 없을 때는 임시 그림으로 보여줘요).
 */
export function pickResident(
  catalog: CatalogEntry[],
  result: ResidentResult,
  unlocked: ReadonlySet<HabitId>,
  rng: () => number = Math.random,
): CatalogEntry | null {
  const available = catalog.filter((c) => c.kind === result.kind && (c.unlock === null || unlocked.has(c.unlock)));
  let candidates = result.kind === 'sprout' ? available.filter((c) => c.rare === result.rare) : available;
  if (candidates.length === 0 && result.kind === 'sprout' && result.rare) {
    candidates = available.filter((c) => !c.rare);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)];
}

/** catalog.json 내용을 읽어서, 형식에 맞는 항목만 남겨요. (잘못된 줄이 있어도 게임이 멈추지 않게) */
export function parseCatalog(json: unknown): { entries: CatalogEntry[]; problems: string[] } {
  const problems: string[] = [];
  const list = (json as { residents?: unknown })?.residents;
  if (!Array.isArray(list)) return { entries: [], problems: ['residents 목록이 없어요.'] };

  const kinds: ResidentKind[] = ['sprout', 'sleepy', 'trouble'];
  const unlocks: (HabitId | null)[] = [null, 'deep-focus', 'rest-and-return', 'many-done'];
  const entries: CatalogEntry[] = [];
  list.forEach((raw, i) => {
    const e = raw as Partial<CatalogEntry>;
    const where = `${i + 1}번째(${e?.id ?? 'id 없음'})`;
    if (typeof e?.id !== 'string' || typeof e.name !== 'string' || typeof e.image !== 'string') {
      problems.push(`${where}: id, name, image가 필요해요.`);
    } else if (!kinds.includes(e.kind as ResidentKind)) {
      problems.push(`${where}: kind는 sprout / sleepy / trouble 중 하나여야 해요.`);
    } else if (!unlocks.includes((e.unlock ?? null) as HabitId | null)) {
      problems.push(`${where}: 알 수 없는 unlock "${e.unlock}" (판정 코드가 있는 조건만 쓸 수 있어요)`);
    } else {
      entries.push({ ...e, rare: e.rare === true, unlock: e.unlock ?? null } as CatalogEntry);
    }
  });
  return { entries, problems };
}
