/**
 * session.js — '하루 운영' 한 건. 날짜별로 하나씩 만들어집니다.
 *
 * session = {
 *   date: '2026-07-19',
 *   config: { courts: 2, rounds: 6, startTime: '08:00', minutes: 30 },
 *   attendance: [memberId, ...],          // 참석 확정 명단
 *   matches: [match, ...],                // 자동 대진 결과 (선택한 후보안)
 *   report: {...},                        // 자동편성 품질 리포트
 *   generatedAt: ISO,
 * }
 *
 * match = {
 *   id, round(1..6), court(1..2),
 *   type: 'MD'|'WD'|'XD',
 *   teamA: [id, id], teamB: [id, id],
 *   scoreA: null|number, scoreB: null|number,
 *   mixedReason: string|null,
 * }
 */

export const DEFAULT_CONFIG = {
  courts: 2,
  rounds: 6,
  startTime: '08:00', // PROJECT_BIBLE §7
  minutes: 30,
  // TODO(PM): 한 게임 목표 점수. 지금은 6게임 기준으로 0~6 입력을 기본값으로 둠.
  maxGames: 6,
  // TODO(PM): 실제 코트 이름. PM 문서에 'C코트 / D코트'로 적혀 있어 그대로 기본값으로 넣었습니다.
  courtNames: ['C', 'D', 'E', 'F'],
};

/** TODO(PM): 클럽명. 현장 공개 화면 맨 위에 표시됩니다. */
export const CLUB_NAME = '스매시프렌즈';

/** 코트 번호(1,2...) → 화면에 보이는 이름(C, D...) */
export function courtName(config, court) {
  const names = config?.courtNames || DEFAULT_CONFIG.courtNames;
  return names[court - 1] || String(court);
}

export const MATCH_TYPE_LABEL = { MD: '남복', WD: '여복', XD: '혼복' };

/** 오늘 날짜 (이 기기의 시계 기준). YYYY-MM-DD */
export function todayKey(d = new Date()) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

/** 이번 주 일요일. 운영이 일요일이라 기본 날짜로 씁니다. (§7) */
export function nextSundayKey(from = new Date()) {
  const d = new Date(from);
  const diff = (7 - d.getDay()) % 7; // 오늘이 일요일이면 오늘
  d.setDate(d.getDate() + diff);
  return todayKey(d);
}

export function emptySession(date) {
  return {
    date,
    config: { ...DEFAULT_CONFIG },
    attendance: [],
    // 지각·조기귀가 예정시간 { [참가자id]: { late, leave } } — 내부 운영정보라 공개 화면에는 안 나갑니다
    times: {},
    matches: [],
    report: null,
    generatedAt: null,
    // 운영모드 (PM 결정): '운영 시작'을 누르면 회원·참석·편성을 잠그고 점수 입력만 되게 합니다.
    mode: 'prep', // 'prep' 준비 중 | 'live' 운영 중
    liveRound: 1, // 지금 진행 중인 게임 번호. 시계가 아니라 운영자가 '경기 종료'를 눌러야 넘어갑니다.
    // REQ-ADMIN-001: 현장에 공개된 대진. 운영진이 '공개'를 눌러야만 채워집니다.
    published: null, // { at: ISO, lineup: [...] }
  };
}

export function getSession(db, date) {
  return db.sessions[date] || emptySession(date);
}

export function putSession(db, session) {
  return { ...db, sessions: { ...db.sessions, [session.date]: session } };
}

/** 라운드 시작 시각 문자열. round=1 -> 08:00, round=2 -> 08:30 ... */
export function roundTime(config, round) {
  const [h, m] = String(config.startTime || '08:00').split(':').map(Number);
  const total = h * 60 + m + (round - 1) * (config.minutes || 30);
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 지금 시각 기준 몇 번째 라운드인지. 운영 전/후면 null. */
export function currentRound(config, now = new Date()) {
  const [h, m] = String(config.startTime || '08:00').split(':').map(Number);
  const start = h * 60 + m;
  const mins = now.getHours() * 60 + now.getMinutes();
  const idx = Math.floor((mins - start) / (config.minutes || 30)) + 1;
  if (idx < 1 || idx > config.rounds) return null;
  return idx;
}

/* ── 점수 규칙 (PM 결정 ②) ─────────────────────
 * 정상 종료 점수만 기록으로 인정합니다.
 *   6:0 ~ 6:4 / 0:6 ~ 4:6 / 5:5 (해피게임 = 무승부)
 * 6:5, 7:5, 6:6 등은 기록되지 않습니다.
 */
export const SCORE_TARGET = 6;
export const SCORE_RULE_TEXT = '6:0~6:4, 0:6~4:6, 5:5(해피게임)만 기록됩니다.';

export function isValidScore(a, b) {
  if (a === null || b === null) return false;
  if (a === 5 && b === 5) return true; // 해피게임 → 무승부
  if (a === SCORE_TARGET && b >= 0 && b <= 4) return true;
  if (b === SCORE_TARGET && a >= 0 && a <= 4) return true;
  return false;
}

/** 두 칸이 다 찼는데 규칙에 안 맞으면 안내 문구를 돌려줍니다. */
export function scoreProblem(match) {
  if (match.scoreA === null || match.scoreB === null) return null;
  if (isValidScore(match.scoreA, match.scoreB)) return null;
  return SCORE_RULE_TEXT;
}

/** 규칙에 맞는 점수가 들어와야 '끝난 경기'로 인정합니다. */
export function isLive(session) {
  return session.mode === 'live';
}

/**
 * 지금 진행 중인 게임 번호.
 * · 운영 중이면 운영자가 '경기 종료'를 누른 만큼만 넘어갑니다 (PM 결정: 점수로 자동 진행 금지)
 * · 운영 전/후에는 시계를 보고 안내만 합니다.
 */
export function activeRound(session, now = new Date()) {
  if (isLive(session)) return session.liveRound || 1;
  return currentRound(session.config, now);
}

export function isMatchDone(match) {
  return isValidScore(match.scoreA, match.scoreB);
}

export function matchWinner(match) {
  if (!isMatchDone(match)) return null;
  if (match.scoreA === match.scoreB) return 'draw'; // 5:5
  return match.scoreA > match.scoreB ? 'A' : 'B';
}

/* ── REQ-ADMIN-001: 관리자 ↔ 현장 공개 분리 ──────────────
 *
 * 원칙
 *  · 점수는 두 화면이 같은 것을 봅니다. 현장에서 누구나 바로 입력할 수 있어야 하므로 항상 공유.
 *  · 대진(누가 어느 코트에서 뛰는지)은 운영진이 '공개'를 눌러야만 현장 화면에 반영됩니다.
 *    → 운영진이 대진을 고쳐도, 공개를 누르기 전까지 현장 화면은 흔들리지 않습니다.
 */

/** 대진에서 '누가 어디서 뛰는지'만 뽑아냅니다. 점수는 뺍니다. */
export function lineupOf(matches) {
  return matches.map((m) => ({
    id: m.id,
    round: m.round,
    court: m.court,
    type: m.type,
    teamA: [...m.teamA],
    teamB: [...m.teamB],
    mixedReason: m.mixedReason || null,
  }));
}

export function isPublished(session) {
  return !!session.published?.at && (session.published.lineup || []).length > 0;
}

/** 공개한 뒤에 운영진이 대진을 고쳤는지 여부 → 고쳤으면 '수정 확정 및 공개 반영' 버튼이 뜹니다. */
export function publishDirty(session) {
  if (!session.matches?.length) return false;
  if (!isPublished(session)) return true;
  return JSON.stringify(lineupOf(session.matches)) !== JSON.stringify(session.published.lineup);
}

export function publishPayload(session) {
  return { at: new Date().toISOString(), lineup: lineupOf(session.matches) };
}

/** 현장 공개 화면이 보는 대진 = 공개된 라인업 + 지금 들어온 점수 */
export function publishedMatches(session) {
  if (!isPublished(session)) return [];
  const byId = new Map((session.matches || []).map((m) => [m.id, m]));
  return session.published.lineup.map((l) => ({
    ...l,
    scoreA: byId.get(l.id)?.scoreA ?? null,
    scoreB: byId.get(l.id)?.scoreB ?? null,
  }));
}

/** 점수 입력 공통 처리 (관리자 화면·현장 화면이 같이 씁니다) */
export function withScore(matches, id, side, raw) {
  if (raw !== '' && raw !== null && Number.isNaN(Number(raw))) return matches;
  // 0~6만 들어갑니다. 7 이상은 아예 입력되지 않습니다. (PM 결정 ②)
  const v = raw === '' || raw === null ? null : Math.max(0, Math.min(SCORE_TARGET, Math.floor(Number(raw))));
  return matches.map((m) => (m.id === id ? { ...m, [side]: v } : m));
}
