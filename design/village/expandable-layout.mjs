// Claude의 맵 연결을 위한 실행 가능한 배치 참고 자료입니다. 앱에서는 아직 사용하지 않아요.
import template from './layout-template.json' with { type: 'json' };

const slotAt = (index) => index === 0 ? 0 : index % 2 === 0 ? -index / 2 : (index + 1) / 2;

/**
 * 방 멤버의 userId 전체와 이전 슬롯 배정을 받아 마당 좌표를 만듭니다.
 * previousAssignments는 방별로 보관하고, 퇴장한 멤버의 배정도 유지하세요.
 * 반환값은 타일 단위이며 PNG 크기나 캐릭터 배율을 늘리지 않습니다.
 */
export function createVillageLayout(memberIds, previousAssignments = []) {
  if (!Array.isArray(memberIds) || !Array.isArray(previousAssignments)) {
    throw new TypeError('멤버와 슬롯 배정은 배열이어야 합니다.');
  }
  const members = new Set();
  for (const id of memberIds) {
    if (typeof id !== 'string' || id.length === 0 || members.has(id)) {
      throw new TypeError('멤버 userId는 중복 없는 빈 문자열이 아닌 값이어야 합니다.');
    }
    members.add(id);
  }

  const assignments = new Map();
  const usedSlots = new Set();
  for (const { userId, slot } of previousAssignments) {
    if (typeof userId !== 'string' || userId.length === 0 || assignments.has(userId)
      || !Number.isSafeInteger(slot) || usedSlots.has(slot)) {
      throw new TypeError('이전 슬롯에는 중복 없는 userId와 정수 슬롯이 필요합니다.');
    }
    assignments.set(userId, slot);
    usedSlots.add(slot);
  }
  let next = 0;
  for (const userId of memberIds) {
    if (assignments.has(userId)) continue;
    while (usedSlots.has(slotAt(next))) next++;
    const slot = slotAt(next++);
    assignments.set(userId, slot);
    usedSlots.add(slot);
  }

  const { yard, plaza, mainStreet, expansion } = template;
  const yardCol = (slot) => yard.origin.col + slot * yard.strideCols;
  const yards = memberIds.map((userId) => {
    const slot = assignments.get(userId);
    const col = yardCol(slot);
    return {
      userId,
      slot,
      rect: { col, row: yard.origin.row, cols: yard.cols, rows: yard.rows },
      gate: {
        side: yard.gate.side,
        col: col + yard.gate.offsetCols,
        row: yard.origin.row + yard.rows - 1,
        cols: yard.gate.cols,
        rows: 1,
      },
      house: {
        col: col + yard.houseOffset.col,
        row: yard.origin.row + yard.houseOffset.row,
        texture: yard.houseTextures[Math.abs(slot) % yard.houseTextures.length],
      },
    };
  });

  // 퇴장해도 기존 집과 광장 좌표, 맵 원점을 재배치하지 않습니다.
  let left = Math.min(yard.origin.col, plaza.col);
  let right = Math.max(yard.origin.col + yard.cols, plaza.col + plaza.cols);
  for (const slot of usedSlots) {
    left = Math.min(left, yardCol(slot));
    right = Math.max(right, yardCol(slot) + yard.cols);
  }
  const padding = expansion.boundsPaddingCols;
  return {
    tileSize: template.tileSize,
    assignments: Array.from(assignments, ([userId, slot]) => ({ userId, slot })),
    yards,
    mainStreet: { col: left, row: mainStreet.row, cols: right - left, rows: mainStreet.rows },
    plaza: { ...plaza },
    plazaConnector: { ...template.plazaConnector },
    plazaAnchors: structuredClone(template.plazaAnchors),
    bounds: { col: left - padding, row: template.bounds.row, cols: right - left + padding * 2, rows: template.bounds.rows },
  };
}
