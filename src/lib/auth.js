/**
 * auth.js — 운영진 로그인 (Supabase Auth · 이메일 + 비밀번호)  [PM 결정 (가)]
 *
 * 원칙
 *  · 로그인이 필요한 곳: 운영진 관리 화면(#/admin)과 관리자 내부정보 서버 요청뿐입니다.
 *  · 로그인이 필요 없는 곳: 현장 공개 대시보드(#/display), 회원 조회(#/view), 현장 점수 입력.
 *  · 회원가입 화면은 만들지 않습니다. 운영진 계정은 Supabase에서 미리 만듭니다.
 *  · 로그인 유지: 접속할 때마다 다시 로그인하지 않도록 토큰을 이 기기에 보관하고 자동 갱신합니다.
 *  · 비밀번호는 이 코드 어디에도 저장하지 않습니다. 서버가 확인하고 '출입증(토큰)'만 돌려줍니다.
 *
 * ★ 화면에서 숨기는 것과 서버가 막는 것은 다릅니다.
 *   이 파일은 '출입증'을 관리할 뿐이고, 실제 차단은 서버의 RLS 규칙이 합니다. (rls.js 자가진단 참고)
 */

import { CLOUD } from './cloudConfig';

const KEY = 'tcm.auth';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function write(v) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장 못 해도 이번 접속 동안은 동작합니다 */
  }
}

function store(json) {
  if (!json?.access_token) return null;
  const saved = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    email: json.user?.email || '',
  };
  write(saved);
  return saved;
}

/** 로그인 */
export async function signIn(email, password) {
  const res = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email).trim(), password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json.error_description || json.msg || json.error || '');
    if (/invalid/i.test(msg)) throw new Error('이메일 또는 비밀번호가 맞지 않습니다.');
    if (/not confirmed/i.test(msg)) throw new Error('이 계정은 아직 승인되지 않았습니다. Supabase에서 승인해 주세요.');
    throw new Error(`로그인 실패 (${res.status}) ${msg}`);
  }
  return store(json);
}

/** 로그아웃 — 이 기기의 출입증을 버립니다 */
export async function signOut() {
  const s = read();
  write(null);
  if (!s) return;
  try {
    await fetch(`${CLOUD.url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: CLOUD.key, Authorization: `Bearer ${s.access_token}` },
    });
  } catch {
    /* 서버에 못 알려도 이 기기에서는 이미 지웠습니다 */
  }
}

/** 비밀번호 재설정 메일 보내기 */
export async function resetPassword(email) {
  const res = await fetch(`${CLOUD.url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email).trim() }),
  });
  if (!res.ok) throw new Error('재설정 메일을 보내지 못했습니다.');
}

/** 출입증이 만료됐으면 조용히 갱신합니다 (로그인 유지) */
export async function ensureToken() {
  const s = read();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60000) return s;
  if (!s.refresh_token) return null;
  try {
    const res = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!res.ok) {
      write(null);
      return null;
    }
    return store(await res.json());
  } catch {
    return s; // 인터넷이 없을 뿐이면 기존 출입증을 그대로 씁니다 (오프라인 우선)
  }
}

export function currentUser() {
  const s = read();
  return s ? { email: s.email } : null;
}

export function isSignedIn() {
  return !!read();
}

/** 서버 요청에 붙일 머리말. 로그인했으면 운영진 출입증, 아니면 공개용 키. */
export async function authHeaders() {
  const s = await ensureToken();
  return {
    apikey: CLOUD.key,
    Authorization: `Bearer ${s?.access_token || CLOUD.key}`,
    'Content-Type': 'application/json',
  };
}

/** 로그인 없이 보내는 머리말 — RLS 자가진단에서 '비로그인 상태'를 흉내낼 때 씁니다 */
export function anonHeaders() {
  return { apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}`, 'Content-Type': 'application/json' };
}
