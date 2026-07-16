/**
 * ranking.js — 당일 랭킹 · 누적 랭킹
 *
 * ★ 공식 순위 기준 (PM 확정, 2026-07-16)
 *    1순위 : 개인 총 획득 게임포인트   (내가 속한 팀이 딴 게임 수의 합)
 *    2순위 : 경기당 평균 획득 게임포인트
 *    3순위 : 그래도 같으면 공동순위
 *
 *  · 승/무/패·득실차는 공식 순위 기준이 아니라 '참고 통계'로만 표시합니다.
 *  · 5:5(해피게임)는 무승부로 기록합니다.
 *  · 게스트는 당일 순위에 포함하고, 누적 순위에서는 제외합니다.
 */

import { isMatchDone, matchWinner } from './session';

export function computeRanking(members, matches) {
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) {
      const m = members.find((x) => x.id === id);
      rows.set(id, {
        id,
        name: m ? m.name : '(삭제된 회원)',
        gender: m ? m.gender : 'M',
        guest: !!m?.guest, // 공개 화면에 'G' 표시용 (누적 랭킹에서는 제외됨)
        played: 0,
        win: 0,
        draw: 0,
        lose: 0,
        gamesWon: 0,
        gamesLost: 0,
      });
    }
    return rows.get(id);
  };

  for (const match of matches) {
    // 배정된 사람은 아직 점수가 없어도 랭킹 표에 나와야 합니다 (0경기로 표시)
    for (const id of [...match.teamA, ...match.teamB]) row(id);
    if (!isMatchDone(match)) continue;

    const w = matchWinner(match);
    for (const [team, mine, theirs] of [
      [match.teamA, match.scoreA, match.scoreB],
      [match.teamB, match.scoreB, match.scoreA],
    ]) {
      const side = team === match.teamA ? 'A' : 'B';
      for (const id of team) {
        const r = row(id);
        r.played += 1;
        r.gamesWon += mine;
        r.gamesLost += theirs;
        if (w === 'draw') r.draw += 1;
        else if (w === side) r.win += 1;
        else r.lose += 1;
      }
    }
  }

  const list = [...rows.values()].map((r) => ({
    ...r,
    // 공식 순위 기준
    points: r.gamesWon, // 개인 총 획득 게임포인트
    avg: r.played ? r.gamesWon / r.played : 0, // 경기당 평균 획득 게임포인트
    // 참고 통계 (공식 순위 아님)
    diff: r.gamesWon - r.gamesLost,
  }));

  // 화면에 늘어놓는 순서는 이름까지 써서 정하지만, 등수는 공식 기준으로만 매깁니다 (공동순위 유지)
  list.sort((a, b) => comparePlayers(a, b) || a.name.localeCompare(b.name, 'ko'));
  // 완전 동률이면 같은 등수
  let rank = 0;
  let prev = null;
  list.forEach((r, i) => {
    if (!prev || comparePlayers(prev, r) !== 0) rank = i + 1;
    r.rank = rank;
    prev = r;
  });
  return list;
}

/** 공식 순위 비교. 0을 돌려주면 공동순위입니다. */
function comparePlayers(a, b) {
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon; // 1순위: 총 획득 게임포인트
  if (b.avg !== a.avg) return b.avg - a.avg; // 2순위: 경기당 평균
  return 0; // 3순위: 공동순위
}

/* ── 누적 랭킹 (여러 주 합산) ────────────── */

/** 대진이 실제로 만들어진 운영일만 뽑아 날짜순으로 돌려줍니다. */
export function sessionDates(sessions) {
  return Object.keys(sessions || {})
    .filter((d) => (sessions[d].matches || []).length > 0)
    .sort();
}

/**
 * 여러 운영일을 합산한 랭킹.
 * 순위 기준은 당일 랭킹과 똑같습니다 (comparePlayers 한 곳에서 관리).
 * days = 그 사람이 실제로 경기에 배정된 운영일 수.
 */
export function computeCumulative(members, sessions, dates) {
  const all = dates.flatMap((d) => sessions[d]?.matches || []);
  // 게스트는 누적 순위에서 제외합니다 (PM 결정 ①·⑦)
  const rows = computeRanking(members, all).filter(
    (r) => !members.find((m) => m.id === r.id)?.guest
  );

  const days = new Map();
  for (const d of dates) {
    for (const m of sessions[d]?.matches || []) {
      for (const id of [...m.teamA, ...m.teamB]) {
        if (!days.has(id)) days.set(id, new Set());
        days.get(id).add(d);
      }
    }
  }
  return rows.map((r) => ({ ...r, days: days.get(r.id)?.size || 0 }));
}

/**
 * 이미 정렬된 목록의 등수를 그 목록 안에서 다시 매깁니다.
 * 예) 남자만 뽑아낸 목록 → 전체 13위였던 사람이 남자 중에서는 3위로 표시되어야 합니다.
 */
export function rerank(sortedRows) {
  let rank = 0;
  let prev = null;
  return sortedRows.map((r, i) => {
    if (!prev || comparePlayers(prev, r) !== 0) rank = i + 1;
    prev = r;
    return { ...r, rank };
  });
}
