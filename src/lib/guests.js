/**
 * guests.js — 게스트(임시 참가자) 관리 (PM 결정 2026-07-16)
 *
 * 규칙
 *  · 정규회원 명단과 완전히 분리된 별도 목록입니다. 자동으로 회원이 되지 않습니다.
 *  · 자동 대진에는 정상적으로 들어갑니다. (남복 4 / 여복 4 / 혼복 남2·여2 규칙 그대로)
 *  · 당일 랭킹 포함 / 누적 랭킹 제외.
 *  · 과거 경기 결과에는 당시 게스트 이름이 그대로 남습니다. → 게스트 기록은 지우지 않고 보관합니다.
 *  · 운영자가 정규회원으로 전환할 수 있습니다. 단 MVP에서는 과거 게스트 기록을 새 회원의
 *    누적 기록에 합치지 않습니다. (PM 미확정 사항)
 *  · 추가·수정·삭제는 관리자 화면에서만 가능합니다.
 *
 * 게스트 = { id, name, gender, guest: true, createdAt, updatedAt, convertedAt, convertedMemberId }
 * 지각·조기귀가 예정시간은 '그 날'의 정보이므로 세션에 저장합니다. (session.times)
 * 이 시간 정보는 내부 운영정보라 공개 화면에 표시하지 않습니다.
 */

import { normalizeName, validateName } from './members';

export function createGuest({ name, gender }) {
  const now = new Date().toISOString();
  return {
    id: `g_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: normalizeName(name),
    gender: gender === 'F' ? 'F' : 'M',
    guest: true,
    createdAt: now,
    updatedAt: now,
    convertedAt: null,
    convertedMemberId: null,
  };
}

export function updateGuest(guest, changes) {
  const next = { ...guest, ...changes, updatedAt: new Date().toISOString() };
  if (changes.name !== undefined) next.name = normalizeName(changes.name);
  return next;
}

export { validateName as validateGuestName };

/**
 * 이름을 찾을 때 쓰는 전체 참가자 목록 = 정규회원 + 게스트.
 * 대진·랭킹·화면 표시는 전부 이 목록을 씁니다.
 */
export function allPlayers(db) {
  return [...(db.members || []), ...(db.guests || [])];
}

/** 오늘 대진에 넣을 수 있는 사람 = 활동 중인 회원 + (정규회원으로 전환되지 않은) 게스트 */
export function pickablePlayers(db) {
  return [
    ...(db.members || []).filter((m) => m.status === 'active'),
    ...(db.guests || []).filter((g) => !g.convertedAt),
  ];
}

export function isGuest(person) {
  return !!person?.guest;
}

/** 그 날의 지각·조기귀가 예정시간 (내부 정보) */
export function timesOf(session, id) {
  return session.times?.[id] || { late: '', leave: '' };
}

export function withTimes(session, id, changes) {
  const cur = timesOf(session, id);
  return { ...(session.times || {}), [id]: { ...cur, ...changes } };
}
