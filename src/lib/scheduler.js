/**
 * scheduler.js — 자동 대진 엔진
 *
 * ★ PROJECT_BIBLE §3: 여기에 AI는 단 한 줄도 들어가지 않습니다.
 *   ChatGPT / Claude / OpenAI / Anthropic API 호출 없음. 100% 규칙 기반 + 난수 재시도.
 *
 * 방식
 *   1) 라운드를 1부터 끝까지 순서대로 채운다. (그리디)
 *   2) 매 코트마다 "지금 가장 경기를 적게 뛴 사람"부터 뽑는다.
 *   3) 난수를 바꿔 수백 번 다시 돌린다. (randomized restart)
 *   4) 점수를 매겨 서로 다른 상위 3개를 후보안으로 낸다. (§12)
 *
 * 점수 = Version 1 개발용 내부 평가모델. 공식 점수 아님. (§10-①, §10-⑤)
 */

import { MATCH_TYPE_LABEL } from './session';

/* ── 난수 (같은 seed면 같은 결과. 재현 가능해야 디버깅이 됨) ── */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pairKey = (a, b) => [a, b].sort().join('|');

/* ── 한 판 만들기 ─────────────────────────────── */

function buildPlan(players, config, rng) {
  const st = new Map(
    players.map((p) => [
      p.id,
      { id: p.id, gender: p.gender, games: 0, partners: new Map(), restStreak: 0, playStreak: 0 },
    ])
  );
  const matches = [];
  // 코트 고정 규칙의 공식 예외 (PM 결정 2026-07-16):
  //   한 성별 참석자가 0명인 날에만 C·D 두 코트 모두 그 성별 복식을 허용합니다.
  //   남녀가 모두 나온 날에는 여복이 C코트로 가지 않습니다.
  const soloGender = !players.some((p) => p.gender === 'M')
    ? 'F'
    : !players.some((p) => p.gender === 'F')
      ? 'M'
      : null;
  const courtsPerRound = Math.min(config.courts, Math.floor(players.length / 4));
  if (courtsPerRound < 1) return null; // 4명 미만이면 대진 자체가 불가능

  for (let round = 1; round <= config.rounds; round++) {
    const busy = new Set();

    for (let court = 1; court <= courtsPerRound; court++) {
      const avail = players.filter((p) => !busy.has(p.id));
      const picked = pickCourt(avail, st, rng, players.length, config, court, soloGender);
      // C코트를 못 채워도 D코트는 따로 판단해야 합니다.
      // (여자만 나온 날: C코트는 비고 D코트에서 여복을 돌려야 함 — break로 빠져나가면 전원 0경기가 됩니다)
      if (!picked) continue;

      const { four, type, mixedReason } = picked;
      const [teamA, teamB] = splitTeams(four, type, st);

      matches.push({
        id: `r${round}c${court}`,
        round,
        court,
        type,
        teamA: teamA.map((p) => p.id),
        teamB: teamB.map((p) => p.id),
        scoreA: null,
        scoreB: null,
        mixedReason: mixedReason || null,
      });

      for (const p of four) busy.add(p.id);
      // 파트너 기록
      for (const team of [teamA, teamB]) {
        const k = pairKey(team[0].id, team[1].id);
        for (const p of team) st.get(p.id).partners.set(k, (st.get(p.id).partners.get(k) || 0) + 1);
      }
    }

    // 라운드 끝 — 뛴 사람/쉰 사람 연속 기록 갱신
    for (const p of players) {
      const s = st.get(p.id);
      if (busy.has(p.id)) {
        s.games += 1;
        s.playStreak += 1;
        s.restStreak = 0;
        s.maxPlayStreak = Math.max(s.maxPlayStreak || 0, s.playStreak);
      } else {
        s.restStreak += 1;
        s.playStreak = 0;
        s.maxRestStreak = Math.max(s.maxRestStreak || 0, s.restStreak);
      }
    }
  }
  return { matches, st };
}

/**
 * 이 코트에 들어갈 4명과 경기 종류를 고른다.
 *
 * ★ 코트 고정 규칙 (PM 결정 ⑨ / BUG-005)
 *    C코트(1번) : 남복 전용. 여복은 절대 C코트로 가지 않는다.
 *    D코트(2번) : 기본 여복. 혼복도 D코트에만 만든다.
 *                 남자가 많아서 남자들이 확실히 덜 뛰고 있을 때만 D코트에 남복 추가 허용.
 *    → 운영자가 현장에서 '대진 수정'으로 직접 바꾼 경우만 예외 (엔진은 관여하지 않음)
 *
 * 그 안에서는 "지금 가장 경기가 모자란 사람"부터 넣는다.
 */
function pickCourt(avail, st, rng, total, config, court, soloGender) {
  const everyonePlays = total <= config.courts * 4;
  const order = (list) =>
    [...list].sort((a, b) => rank(a, st, rng, everyonePlays) - rank(b, st, rng, everyonePlays));

  const men = order(avail.filter((p) => p.gender === 'M'));
  const women = order(avail.filter((p) => p.gender === 'F'));
  const avgOf = (list) => list.slice(0, 4).reduce((a, p) => a + st.get(p.id).games, 0) / Math.min(4, list.length || 1);

  // ── 예외: 한 성별만 나온 날은 두 코트 모두 그 성별 복식 ──
  if (soloGender === 'F') {
    return women.length >= 4 ? { four: women.slice(0, 4), type: 'WD', mixedReason: null } : null;
  }
  if (soloGender === 'M') {
    return men.length >= 4 ? { four: men.slice(0, 4), type: 'MD', mixedReason: null } : null;
  }

  // ── C코트: 남복만 (남녀가 모두 나온 날) ──
  if (court === 1) {
    if (men.length >= 4) return { four: men.slice(0, 4), type: 'MD', mixedReason: null };
    return null; // 남자가 4명 미만이면 C코트는 비웁니다 (여복을 올리지 않음)
  }

  // ── D코트: 여복 / 혼복 / 남복 중에서 '지금 가장 경기가 모자란 사람들'이 들어가는 안을 고릅니다 ──
  //
  // PM 결정 2026-07-16: 혼복은 '편성이 불가능할 때만 쓰는 최후수단'이 아니라
  //   개인별 경기 수 차이를 줄이기 위한 운영 수단입니다. 균형에 도움이 되면 적극적으로 씁니다.
  //   (예: 남10 여2 → 예전 규칙은 D코트도 남복이라 여자 2명이 하루 종일 0경기였습니다)
  const needOf = (list) => list.reduce((a, p) => a + st.get(p.id).games, 0) / list.length;

  const options = [];
  // 동점이면 여복 → 혼복 → 남복 순 (D코트 기본값은 여복)
  if (women.length >= 4) options.push({ type: 'WD', four: women.slice(0, 4), rank: 0 });
  if (men.length >= 2 && women.length >= 2)
    options.push({ type: 'XD', four: [...men.slice(0, 2), ...women.slice(0, 2)], rank: 1 });
  if (men.length >= 4) options.push({ type: 'MD', four: men.slice(0, 4), rank: 2 });
  if (!options.length) return null;

  for (const o of options) o.need = needOf(o.four);
  options.sort((a, b) => a.need - b.need || a.rank - b.rank);
  const best = options[0];

  return {
    four: best.four,
    type: best.type,
    mixedReason:
      best.type !== 'XD'
        ? null
        : women.length < 4 || men.length < 4
          ? `남 ${men.length}명 · 여 ${women.length}명이라 남복·여복을 만들 수 없어 D코트에 혼복 편성`
          : '경기 수 차이를 줄이기 위해 D코트에 혼복 편성 (균형 목적)',
  };
}

/** 낮을수록 먼저 뽑힘. 경기 수 균형이 가장 세다. */
function rank(p, st, rng, penalizeConsecutive) {
  const s = st.get(p.id);
  let v = s.games * 1000; // ① 적게 뛴 사람 먼저
  v -= s.restStreak * 60; // ② 오래 쉰 사람 먼저
  if (penalizeConsecutive) v += s.playStreak * 40; // ③ 피할 수 있으면 연속 출전 피함
  v += rng() * 30; // ④ 동점이면 무작위 → 후보안이 서로 달라짐
  return v;
}

/** 4명을 2:2로 나눈다. 이미 같이 뛴 조합은 피한다. */
function splitTeams(four, type, st) {
  const repeats = (a, b) => st.get(a.id).partners.get(pairKey(a.id, b.id)) || 0;
  let options;
  if (type === 'XD') {
    const [m1, m2, w1, w2] = four;
    // 혼복은 각 팀 남1 + 여1 (PM 결정 ④)
    options = [
      [[m1, w1], [m2, w2]],
      [[m1, w2], [m2, w1]],
    ];
  } else {
    const [a, b, c, d] = four;
    options = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ];
  }
  options.sort(
    (x, y) =>
      repeats(x[0][0], x[0][1]) + repeats(x[1][0], x[1][1]) -
      (repeats(y[0][0], y[0][1]) + repeats(y[1][0], y[1][1]))
  );
  return options[0];
}

/* ── 품질 평가 (§13) ─────────────────────────── */

/**
 * Version 1 내부 평가모델 — 만점 700
 *   경기 수 균형   300
 *   파트너 다양성  200
 *   휴식 품질      150
 *   규칙 준수       50
 */
export function evaluate(plan, players, config) {
  const { matches, st } = plan;
  const total = players.length;
  const R = config.rounds;
  const everyonePlays = total <= config.courts * 4;

  const games = players.map((p) => st.get(p.id).games);
  const min = Math.min(...games);
  const max = Math.max(...games);
  const spread = max - min;
  const avg = games.reduce((a, b) => a + b, 0) / games.length;
  const dev = Math.sqrt(games.reduce((a, g) => a + (g - avg) ** 2, 0) / games.length);
  const balanceScore = clamp(300 - spread * 45 - dev * 30, 0, 300);

  // ── 중복 파트너 ──
  const pairCount = new Map();
  for (const m of matches) {
    for (const t of [m.teamA, m.teamB]) {
      const k = pairKey(t[0], t[1]);
      pairCount.set(k, (pairCount.get(k) || 0) + 1);
    }
  }
  const repeats = [...pairCount.values()].reduce((a, c) => a + Math.max(0, c - 1), 0);
  // 사람이 적으면 짝이 겹치는 것 자체가 수학적으로 불가피합니다. 불가피한 몫은 벌점에서 뺍니다. (§10-③ 원칙)
  // TODO: 지금은 성별을 무시한 느슨한 하한선(C(n,2))입니다. 남복/여복만 도는 클럽이면 더 조여야 정확합니다.
  const teamSlots = matches.length * 2;
  const minRepeats = Math.max(0, teamSlots - (total * (total - 1)) / 2);
  const avoidableRepeats = Math.max(0, repeats - minRepeats);
  const partnerScore = clamp(200 - avoidableRepeats * 25, 0, 200);

  // ── 휴식 / 연속 출전 ──
  // 6게임 중 g게임 뛰는 사람은 아무리 잘 짜도 최소 ceil((R-g)/(g+1))라운드는 연달아 쉬게 됩니다.
  // 그 하한선을 넘긴 경우(=피할 수 있었는데 안 피한 경우)만 감점합니다. (§10-③)
  let avoidableRest = 0;
  let avoidablePlay = 0;
  let longRest = 0;
  let longPlay = 0;
  let unused = [];
  for (const p of players) {
    const s = st.get(p.id);
    const g = s.games;
    if (g === 0) unused.push(p.name);
    const maxRest = s.maxRestStreak || 0;
    const maxPlay = s.maxPlayStreak || 0;
    if (maxRest >= 3) longRest += 1;
    if (maxPlay >= 4) longPlay += 1;
    const restFloor = Math.ceil((R - g) / (g + 1));
    const playFloor = R - g + 1 > 0 ? Math.ceil(g / (R - g + 1)) : R;
    if (maxRest >= 3 && maxRest > restFloor) avoidableRest += 1;
    if (maxPlay >= 4 && maxPlay > playFloor) avoidablePlay += 1;
  }
  const restScore = clamp(150 - avoidableRest * 30 - avoidablePlay * 25, 0, 150);

  const violations = checkHard(matches, players);
  const ruleScore = clamp(50 - violations.length * 50, 0, 50);

  const mixed = matches.filter((m) => m.type === 'XD');

  return {
    score: Math.round(balanceScore + partnerScore + restScore + ruleScore),
    max: 700,
    parts: {
      balance: Math.round(balanceScore),
      partner: Math.round(partnerScore),
      rest: Math.round(restScore),
      rule: Math.round(ruleScore),
    },
    balance: { min, max, spread, avg: Number(avg.toFixed(1)) },
    gamesByPlayer: Object.fromEntries(players.map((p) => [p.id, st.get(p.id).games])),
    repeatPartners: [...pairCount.entries()].filter(([, c]) => c > 1).map(([k, c]) => ({ k, c })),
    repeatTotal: repeats,
    unavoidableRepeats: minRepeats,
    longRest,
    longPlay,
    avoidableRest,
    avoidablePlay,
    consecutiveUnavoidable: everyonePlays,
    unusedPlayers: unused,
    mixedCount: mixed.length,
    mixedReasons: [...new Set(mixed.map((m) => m.mixedReason).filter(Boolean))],
    violations,
    matchCount: matches.length,
  };
}

/** 절대 어기면 안 되는 규칙만 확인 */
function checkHard(matches, players) {
  const out = [];
  const byRound = new Map();
  for (const m of matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round).push(m);
  }
  for (const [round, list] of byRound) {
    const seen = new Set();
    for (const m of list) {
      for (const id of [...m.teamA, ...m.teamB]) {
        if (seen.has(id)) {
          const p = players.find((x) => x.id === id);
          out.push(`${round}라운드: ${p ? p.name : id} 님이 두 코트에 동시에 배정됨`);
        }
        seen.add(id);
      }
    }
  }
  for (const m of matches) {
    if (m.teamA.length !== 2 || m.teamB.length !== 2) out.push(`${m.round}라운드 ${m.court}코트: 인원이 4명이 아님`);
    // 코트 고정 규칙 (PM 결정 ⑨ + 한 성별만 참석한 날 예외)
    const noMen = !players.some((p) => p.gender === 'M');
    const okSolo = noMen && m.type === 'WD'; // 여자만 나온 날은 C코트 여복 허용
    if (m.court === 1 && m.type !== 'MD' && !okSolo) out.push(`${m.round}게임 C코트: 남복이 아님 (${m.type})`);
    if (m.type === 'XD') {
      const g = [...m.teamA, ...m.teamB].map((id) => players.find((p) => p.id === id)?.gender);
      if (g.filter((x) => x === 'M').length !== 2) out.push(`${m.round}라운드 ${m.court}코트: 혼복 남녀 2:2 아님`);
    }
  }
  return out;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ── 후보안 3개 만들기 (§12) ──────────────────── */

export function generateCandidates(players, config, tries = 400) {
  if (players.length < 4) {
    return { candidates: [], error: '참석 인원이 4명보다 적어 대진을 만들 수 없습니다.' };
  }
  const found = [];
  const seen = new Set();
  const seed = Date.now() % 100000;

  for (let i = 0; i < tries; i++) {
    const plan = buildPlan(players, config, mulberry32(seed + i * 7919));
    if (!plan) continue;
    const sig = plan.matches.map((m) => `${m.round}${m.court}${[...m.teamA].sort()}${[...m.teamB].sort()}`).join(';');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const report = evaluate(plan, players, config);
    found.push({ matches: plan.matches, report });
  }

  found.sort((a, b) => b.report.score - a.report.score);
  const top = found.slice(0, 3);
  top.forEach((c, i) => {
    c.label = `후보 ${i + 1}`;
    c.recommended = i === 0;
    c.reason = reasonText(c.report, i === 0);
  });
  return { candidates: top, error: null };
}

function reasonText(r, isBest) {
  const bits = [];
  bits.push(r.balance.spread === 0 ? '전원 경기 수가 완전히 같습니다' : `경기 수 차이가 최대 ${r.balance.spread}게임입니다`);
  bits.push(r.repeatPartners.length === 0 ? '같은 파트너가 반복되지 않습니다' : `파트너가 겹치는 조합이 ${r.repeatPartners.length}개 있습니다`);
  if (r.mixedCount > 0) bits.push(`혼복 ${r.mixedCount}경기`);
  if (r.longRest > 0) bits.push(`3라운드 이상 연달아 쉬는 사람 ${r.longRest}명`);
  if (r.unusedPlayers.length > 0) bits.push(`한 게임도 못 뛰는 사람 ${r.unusedPlayers.length}명(${r.unusedPlayers.join(', ')})`);
  if (r.violations.length > 0) bits.push(`규칙 위반 ${r.violations.length}건`);
  return (isBest ? '추천 — ' : '') + bits.join(' · ') + '.';
}

export { MATCH_TYPE_LABEL };
