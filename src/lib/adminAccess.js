/**
 * adminAccess.js — 관리자 화면 간단 접근코드 (PM 결정 ⑥)
 *
 * ★ 이것은 보안 기능이 아닙니다.
 *   일반 회원이 실수로 관리자 화면에 들어오는 것을 막는 MVP 임시 장치입니다.
 *   Supabase 연결 후 실제 운영자 로그인으로 교체합니다.
 *
 * · 코드는 소스에 적어두지 않습니다. Product Owner가 화면에서 직접 정하고 바꿉니다.
 * · 저장할 때도 코드 그대로가 아니라 뒤섞은 값(해시)만 저장합니다.
 * · 점수 입력(현장 화면)과 회원 조회 화면에는 코드를 절대 묻지 않습니다.
 */

const UNLOCK_KEY = 'tcm.admin.ok';

/** 짧은 해시(FNV-1a). 코드 원문을 저장하지 않기 위한 최소한의 조치입니다. */
export function hashCode(text) {
  let h = 2166136261;
  const s = String(text).trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function codeHashOf(db) {
  return db.settings?.adminCodeHash || null;
}

export function isCodeSet(db) {
  return !!codeHashOf(db);
}

export function withCode(db, code) {
  return { ...db, settings: { ...(db.settings || {}), adminCodeHash: code ? hashCode(code) : null } };
}

export function checkCode(db, code) {
  const want = codeHashOf(db);
  return !!want && hashCode(code) === want;
}

/** 한 번 맞히면 이 기기에서는 계속 열립니다 (운영진 아이패드 편의). '잠그기'로 해제. */
export function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnlocked(v) {
  try {
    if (v) localStorage.setItem(UNLOCK_KEY, '1');
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* 저장 못 해도 화면은 동작해야 합니다 */
  }
}
