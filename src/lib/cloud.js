/**
 * cloud.js — 기기 간 데이터 공유 (Supabase) · S1 단계
 *
 * ★ 설계 원칙 (PM 결정 ⑧)
 *  1) 로컬 저장을 절대 없애지 않습니다. 인터넷이 없어도 지금까지처럼 그대로 동작합니다.
 *     서버는 '여러 기기가 같은 것을 보게 해주는 보조 장치'일 뿐입니다.
 *  2) **내부정보는 서버에 아예 올리지 않습니다.**
 *     참석 원본 / 지각·조기귀가 시간 / 후보안 / 품질점수 / 관리자 접근코드 → 서버에 없음.
 *     서버에 없으니 공개 화면에서 조회 자체가 불가능합니다. (F항을 구조로 보장)
 *  3) 서버에 올리는 것은 '공개해도 되는 것'뿐입니다.
 *     · 이름·성별·게스트 여부 (대진표에 이름을 띄우려면 필요)
 *     · 확정·공개된 대진(라인업)
 *     · 점수
 *     그 외 랭킹은 이 세 가지로 각 기기가 계산합니다. (서버에 랭킹을 따로 저장하지 않음)
 *
 * ★ 충돌 처리: 나중에 저장한 쪽이 이깁니다 (Last Write Wins). MVP 방식이며 화면에 명시합니다.
 *
 * 서버 표 3개
 *   roster      : { id:'main', data:[{id,name,gender,guest}], updated_at }
 *   day_public  : { date, data:{config, lineup, publishedAt}, updated_at }
 *   day_scores  : { date, data:{ matchId: {a,b} }, updated_at }
 */

import { CLOUD, cloudReady } from './cloudConfig';
import { authHeaders } from './auth';
import { getSession, putSession, isPublished } from './session';

/** 로그인했으면 운영진 출입증이, 아니면 공개용 키가 붙습니다. 실제 차단은 서버(RLS)가 합니다. */
async function upsert(table, row) {
  const res = await fetch(`${CLOUD.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ ...row, updated_at: new Date().toISOString() }]),
  });
  if (res.status === 401 || res.status === 403)
    throw new Error(`권한이 없습니다 (${table}). 운영진 로그인이 필요합니다.`);
  if (!res.ok) throw new Error(`서버 저장 실패 (${table} · ${res.status})`);
}

async function selectOne(table, where) {
  const res = await fetch(`${CLOUD.url}/rest/v1/${table}?${where}&limit=1`, { headers: await authHeaders() });
  if (res.status === 401 || res.status === 403) return null; // 권한 없음 = 없는 것으로 취급
  if (!res.ok) throw new Error(`서버 읽기 실패 (${table} · ${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

/* ── 서버에 올릴 것만 골라내기 ───────────────── */

/** 이름표시에 필요한 최소 정보만. 휴면 여부·가입일 등은 올리지 않습니다. */
function publicRoster(db) {
  return [
    ...(db.members || []).map((m) => ({ id: m.id, name: m.name, gender: m.gender })),
    ...(db.guests || []).map((g) => ({ id: g.id, name: g.name, gender: g.gender, guest: true })),
  ];
}

function scoresOf(session) {
  const out = {};
  for (const m of session.matches || []) {
    if (m.scoreA !== null || m.scoreB !== null) out[m.id] = { a: m.scoreA, b: m.scoreB };
  }
  return out;
}

/* ── 보내기 / 가져오기 ──────────────────────── */

/** 관리자 기기 → 서버 (명단 + 공개 대진 + 점수) */
export async function push(db, date) {
  if (!cloudReady()) throw new Error('서버 연결 정보가 없습니다.');
  const session = getSession(db, date);

  await upsert('roster', { id: 'main', data: publicRoster(db) });

  if (isPublished(session)) {
    await upsert('day_public', {
      date,
      data: {
        config: session.config,
        lineup: session.published.lineup,
        publishedAt: session.published.at,
      },
    });
  }
  await upsert('day_scores', { date, data: scoresOf(session) });

  // 관리자 내부정보 — 운영진만 읽고 쓸 수 있는 표에 저장합니다 (서버 RLS가 차단)
  // 참석 원본 / 지각·조기귀가 / 후보안·품질리포트 / 확정 전 작업 대진 / 운영모드
  await upsert('admin_day', {
    date,
    data: {
      attendance: session.attendance,
      times: session.times || {},
      matches: session.matches,
      report: session.report,
      mode: session.mode,
      liveRound: session.liveRound,
      generatedAt: session.generatedAt,
    },
  });
}

/** 점수만 보내기 (현장에서 점수 넣을 때마다 — 가볍게) */
export async function pushScores(db, date) {
  if (!cloudReady()) return;
  await upsert('day_scores', { date, data: scoresOf(getSession(db, date)) });
}

/**
 * 서버 → 이 기기.
 * 규칙: 이 기기가 아직 만들지 않은 것만 채우고, 이미 있는 대진(작업 중인 라인업)은 건드리지 않습니다.
 *       점수는 항상 서버 값으로 맞춥니다. (현장에서 여러 명이 넣기 때문)
 */
export async function pull(db, date) {
  if (!cloudReady()) throw new Error('서버 연결 정보가 없습니다.');

  const [rosterRow, publicRow, scoreRow, adminRow] = await Promise.all([
    selectOne('roster', 'id=eq.main'),
    selectOne('day_public', `date=eq.${encodeURIComponent(date)}`),
    selectOne('day_scores', `date=eq.${encodeURIComponent(date)}`),
    // 로그인하지 않았으면 서버가 막아서 null이 옵니다 → 내부정보는 그대로 안 보입니다
    selectOne('admin_day', `date=eq.${encodeURIComponent(date)}`).catch(() => null),
  ]);

  let next = { ...db, members: [...(db.members || [])], guests: [...(db.guests || [])] };

  // 1) 명단: 서버에 있는 이름으로 맞추고, 이 기기에 없는 사람은 새로 넣습니다
  if (rosterRow?.data) {
    for (const p of rosterRow.data) {
      const list = p.guest ? 'guests' : 'members';
      const i = next[list].findIndex((x) => x.id === p.id);
      if (i >= 0) next[list][i] = { ...next[list][i], name: p.name, gender: p.gender };
      else
        next[list].push(
          p.guest
            ? { id: p.id, name: p.name, gender: p.gender, guest: true, convertedAt: null }
            : { id: p.id, name: p.name, gender: p.gender, status: 'active' }
        );
    }
  }

  const session = getSession(next, date);
  let changes = {};

  // 2) 공개된 대진
  if (publicRow?.data?.lineup?.length) {
    changes.published = { at: publicRow.data.publishedAt, lineup: publicRow.data.lineup };
    if (publicRow.data.config) changes.config = { ...session.config, ...publicRow.data.config };
    // 이 기기에 대진이 아직 없으면(현장 태블릿·회원 폰) 공개된 대진으로 채웁니다.
    // 이미 있으면 운영진이 손보는 중일 수 있으므로 그대로 둡니다.
    if (!(session.matches || []).length) {
      changes.matches = publicRow.data.lineup.map((l) => ({ ...l, scoreA: null, scoreB: null }));
    }
  }

  // 2-b) 관리자 내부정보 — 운영진으로 로그인한 기기에만 옵니다
  if (adminRow?.data) {
    const a = adminRow.data;
    changes.attendance = a.attendance || session.attendance;
    changes.times = a.times || session.times || {};
    changes.report = a.report ?? session.report;
    changes.mode = a.mode || session.mode;
    changes.liveRound = a.liveRound || session.liveRound;
    if (a.matches?.length) changes.matches = a.matches;
  }

  // 3) 점수 — 서버 값으로 맞춥니다
  const cloudScores = scoreRow?.data || {};
  const base = changes.matches || session.matches || [];
  if (base.length) {
    changes.matches = base.map((m) => {
      const s = cloudScores[m.id];
      return s ? { ...m, scoreA: s.a ?? null, scoreB: s.b ?? null } : m;
    });
  }

  next = putSession(next, { ...session, ...changes });
  return { db: next, found: !!(rosterRow || publicRow || scoreRow) };
}

/* ── 상태 표시용 ─────────────────────────── */

const LAST_KEY = 'tcm.cloud.last';

export function lastSync() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function markSynced() {
  try {
    localStorage.setItem(LAST_KEY, new Date().toISOString());
  } catch {
    /* 저장 못 해도 동작에는 지장 없습니다 */
  }
}

export function syncTimeText() {
  const t = lastSync();
  if (!t) return '아직 없음';
  const d = new Date(t);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  return `${d.getHours()}시 ${String(d.getMinutes()).padStart(2, '0')}분`;
}

export { cloudReady };
