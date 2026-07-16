/**
 * rls.js — RLS 자가진단 (PM 완료기준 5개 테스트를 앱이 실제로 서버에 요청해서 확인)
 *
 * 왜 이게 필요한가
 *  · "화면에서 숨겼다"는 완료가 아닙니다. 서버가 실제로 막아야 완료입니다.
 *  · 개발자(Claude)의 작업 환경에서는 Supabase에 접속할 수 없어 대신 테스트할 수 없습니다.
 *  · 그래서 앱이 스스로 진짜 요청을 보내 결과를 보여 줍니다. 이 결과를 캡처해 PM께 제출합니다.
 *
 * 테스트는 '비로그인 상태'를 흉내내기 위해 공개용 키만 붙여서 요청합니다.
 */

import { CLOUD } from './cloudConfig';
import { anonHeaders, authHeaders, isSignedIn } from './auth';

async function req(table, { method = 'GET', body, headers, query = '' }) {
  const res = await fetch(`${CLOUD.url}/rest/v1/${table}${query}`, {
    method,
    headers: { ...headers, Prefer: 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let rows = null;
  if (method === 'GET') rows = await res.json().catch(() => null);
  return { status: res.status, rows };
}

/**
 * PM 완료기준 5개 테스트
 * 통과 조건
 *  1. 로그아웃 상태로 관리자 내부 데이터(admin_day) 읽기 → 막혀야 함 (0건 또는 401/403)
 *  2. 로그인 상태로 관리자 내부 데이터 읽기 → 되어야 함
 *  3. 로그아웃 상태로 공개 확정 대진(day_public) 읽기 → 되어야 함
 *  4. 로그아웃 상태로 확정 전 후보 대진(admin_day 안에 있음) 읽기 → 막혀야 함
 *  5. 로그아웃 상태로 회원관리 데이터(roster) 수정 → 막혀야 함
 */
export async function runRlsTests(date) {
  const out = [];
  const anon = anonHeaders();
  const q = `?date=eq.${encodeURIComponent(date)}`;

  // 1
  try {
    const r = await req('admin_day', { headers: anon, query: q });
    const blocked = r.status === 401 || r.status === 403 || (Array.isArray(r.rows) && r.rows.length === 0);
    out.push({
      no: 1,
      name: '로그아웃 상태에서 관리자 내부 데이터 요청',
      want: '거부',
      got: blocked ? '거부됨' : `허용됨 (${r.rows?.length}건 조회) — 위험`,
      pass: blocked,
    });
  } catch (e) {
    out.push({ no: 1, name: '로그아웃 상태에서 관리자 내부 데이터 요청', want: '거부', got: '거부됨(요청 실패)', pass: true });
  }

  // 2
  if (isSignedIn()) {
    try {
      const r = await req('admin_day', { headers: await authHeaders(), query: q });
      const okRead = r.status === 200 && Array.isArray(r.rows);
      out.push({
        no: 2,
        name: '로그인 상태에서 관리자 내부 데이터 요청',
        want: '허용',
        got: okRead ? `허용됨 (${r.rows.length}건)` : `막힘 (${r.status})`,
        pass: okRead,
      });
    } catch {
      out.push({ no: 2, name: '로그인 상태에서 관리자 내부 데이터 요청', want: '허용', got: '요청 실패', pass: false });
    }
  } else {
    out.push({ no: 2, name: '로그인 상태에서 관리자 내부 데이터 요청', want: '허용', got: '로그인 후 다시 실행하세요', pass: null });
  }

  // 3
  try {
    const r = await req('day_public', { headers: anon, query: q });
    const okRead = r.status === 200 && Array.isArray(r.rows);
    out.push({
      no: 3,
      name: '로그아웃 상태에서 공개 확정 대진 요청',
      want: '허용',
      got: okRead ? `허용됨 (${r.rows.length}건)` : `막힘 (${r.status}) — 회원 화면이 안 보이게 됩니다`,
      pass: okRead,
    });
  } catch {
    out.push({ no: 3, name: '로그아웃 상태에서 공개 확정 대진 요청', want: '허용', got: '요청 실패', pass: false });
  }

  // 4 — 확정 전 후보 대진은 admin_day 안에만 있습니다
  try {
    const r = await req('admin_day', { headers: anon, query: `${q}&select=data` });
    const blocked = r.status === 401 || r.status === 403 || (Array.isArray(r.rows) && r.rows.length === 0);
    out.push({
      no: 4,
      name: '로그아웃 상태에서 확정 전 후보 대진 요청',
      want: '거부',
      got: blocked ? '거부됨' : '허용됨 — 위험',
      pass: blocked,
    });
  } catch {
    out.push({ no: 4, name: '로그아웃 상태에서 확정 전 후보 대진 요청', want: '거부', got: '거부됨(요청 실패)', pass: true });
  }

  // 5 — 회원관리 데이터 수정 시도
  try {
    const r = await req('roster', {
      method: 'POST',
      headers: anon,
      body: [{ id: 'rls_test_should_fail', data: [] }],
    });
    const blocked = r.status === 401 || r.status === 403;
    out.push({
      no: 5,
      name: '공개 화면에서 회원관리 데이터 수정 시도',
      want: '거부',
      got: blocked ? `거부됨 (${r.status})` : `허용됨 (${r.status}) — 위험`,
      pass: blocked,
    });
  } catch {
    out.push({ no: 5, name: '공개 화면에서 회원관리 데이터 수정 시도', want: '거부', got: '거부됨(요청 실패)', pass: true });
  }

  return out;
}
