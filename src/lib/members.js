/**
 * members.js
 * 회원 데이터의 규칙만 담습니다. 화면 코드는 여기 들어오지 않습니다.
 *
 * 회원 1명의 모양
 * {
 *   id: 'm_ab12cd34',   // 절대 바뀌지 않음. 참석/대진/점수는 이름이 아니라 이 id로 연결됨
 *   name: '홍길동',
 *   gender: 'M' | 'F',
 *   status: 'active' | 'resting',   // resting = 휴면(탈퇴/장기 미참석). 기록은 남고 대진에서만 빠짐
 *   createdAt: ISO 문자열,
 *   updatedAt: ISO 문자열,
 * }
 */

export const GENDERS = [
  { code: 'M', label: '남' },
  { code: 'F', label: '여' },
];

export function genderLabel(code) {
  return code === 'F' ? '여' : '남';
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'm_' + crypto.randomUUID().slice(0, 8);
  }
  return 'm_' + Math.random().toString(16).slice(2, 10);
}

export function normalizeName(name) {
  // 앞뒤 공백 제거 + 가운데 연속 공백 1칸으로. ('홍  길동' 과 '홍 길동' 을 같은 이름으로 취급)
  return String(name || '').trim().replace(/\s+/g, ' ');
}

/** 이름이 규칙에 맞는지. 통과하면 null, 아니면 사람이 읽을 오류 문장. */
export function validateName(name) {
  const n = normalizeName(name);
  if (!n) return '이름을 입력하세요.';
  if (n.length > 20) return '이름은 20자까지 입력할 수 있습니다.';
  return null;
}

/** 같은 이름이 이미 있는지 (자기 자신은 제외). 동명이인 자체는 허용합니다. */
export function findSameName(members, name, exceptId = null) {
  const n = normalizeName(name);
  return members.filter((m) => m.id !== exceptId && m.name === n);
}

export function createMember({ name, gender }) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: normalizeName(name),
    gender: gender === 'F' ? 'F' : 'M',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateMember(member, patch) {
  return {
    ...member,
    ...patch,
    name: patch.name !== undefined ? normalizeName(patch.name) : member.name,
    updatedAt: new Date().toISOString(),
  };
}

/** 성별 묶고 → 가나다순. 운영자가 종이 명단 읽듯 훑을 수 있게. */
export function sortMembers(members) {
  return [...members].sort((a, b) => {
    if (a.gender !== b.gender) return a.gender === 'M' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export function countActive(members) {
  const active = members.filter((m) => m.status === 'active');
  return {
    male: active.filter((m) => m.gender === 'M').length,
    female: active.filter((m) => m.gender === 'F').length,
    total: active.length,
    resting: members.length - active.length,
  };
}

/**
 * 오늘 기준 운영 가능성 힌트.
 * 2코트 × 6게임 = 한 게임에 4명. 복식이므로 성별당 4명 단위로 코트가 채워집니다.
 * 참석관리가 붙기 전까지는 '등록 회원 기준' 참고용입니다.
 */
export function courtHint({ male, female }) {
  const maleCourts = Math.floor(male / 4);
  const femaleCourts = Math.floor(female / 4);
  return { maleCourts, femaleCourts, mixedNeeded: male % 4 !== 0 || female % 4 !== 0 };
}
