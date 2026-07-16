import { useEffect, useMemo, useState } from 'react';
import {
  CLUB_NAME,
  MATCH_TYPE_LABEL,
  courtName,
  roundTime,
  activeRound,
  isMatchDone,
  matchWinner,
  isPublished,
  publishedMatches,
  withScore,
} from '../../lib/session';
import { computeRanking, rerank } from '../../lib/ranking';
import { allPlayers } from '../../lib/guests';

/**
 * 현장 공개 대시보드 — REQ-ADMIN-001
 *
 * 이 화면에 나오는 것: 클럽명 · 날짜/시간 · 확정된 대진표 전체 · 현재/다음 경기 · 코트별 점수 입력
 *                      · 경기 진행상태 · 남자 당일 1~3위 · 여자 당일 1~3위
 * 이 화면에 절대 안 나오는 것: 회원관리 · 참석관리 · 후보안 · 품질점수 · 내부 리포트 · 편성 설정
 *                             · 백업/복원 · 누적 관리 · 내부 경고/메모 · 불참/지각 정보
 *
 * 권한 (C항)
 *  · 점수 입력: 항상 가능 (현장 누구나)
 *  · 선수 교체 / 대진 삭제 / 재편성 / 회원·참석 수정: 불가 (관리자 화면에서만)
 *  · 이미 들어간 점수를 고칠 때는 '점수 수정' 버튼 + 확인 절차
 */
export default function DisplayPage({ db, session, updateSession }) {
  const [, tick] = useState(0);
  const [unlocked, setUnlocked] = useState(() => new Set());

  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 30000); // 30초마다 '지금 경기' 갱신
    return () => clearInterval(t);
  }, []);

  const cfg = session.config;
  const matches = useMemo(() => publishedMatches(session), [session]);
  const players = allPlayers(db);
  const nameOf = (id) => players.find((m) => m.id === id)?.name || '(알 수 없음)';
  // 공개 화면에는 이름 옆에 작은 'G'만 붙입니다 (지각·귀가 시간 등 내부정보는 안 나갑니다)
  const isG = (id) => !!players.find((m) => m.id === id)?.guest;
  const now = activeRound(session);

  const done = matches.filter(isMatchDone).length;
  const nowMatches = matches.filter((m) => m.round === now);
  const nextRound = now ? now + 1 : matches.length ? 1 : null;
  const nextMatches = matches.filter((m) => m.round === nextRound);

  const rank = useMemo(() => computeRanking(players, matches), [db.members, db.guests, matches]);
  // 남자·여자 각각 그 안에서 1~3위를 매깁니다 (전체 등수 번호를 그대로 쓰면 '13위'처럼 보입니다)
  const top = (g) => rerank(rank.filter((r) => r.gender === g && r.played > 0)).slice(0, 3);

  const setScore = (id, side, raw) => updateSession({ matches: withScore(session.matches, id, side, raw) });

  function unlock(id) {
    if (window.confirm('이미 입력된 점수를 고칩니다.\n계속할까요?')) {
      setUnlocked((prev) => new Set(prev).add(id));
    }
  }

  const rounds = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round).push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  const tile = (m, big) => (
    <MatchTile
      key={m.id}
      match={m}
      big={big}
      cfg={cfg}
      nameOf={nameOf}
      isG={isG}
      unlocked={unlocked.has(m.id)}
      onScore={setScore}
      onUnlock={unlock}
    />
  );

  if (!isPublished(session)) {
    return (
      <div className="tcm-display">
        <header className="tcm-head">
          <div>
            <h1 className="tcm-title">{CLUB_NAME}</h1>
            <p className="tcm-sub">
              {session.date} · {cfg.startTime}–11:00
            </p>
          </div>
        </header>
        <p className="tcm-empty">
          아직 대진이 공개되지 않았습니다.
          <br />
          운영진이 대진을 확정하면 이 화면에 자동으로 나타납니다.
        </p>
      </div>
    );
  }

  return (
    <div className="tcm-display">
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">{CLUB_NAME}</h1>
          <p className="tcm-sub">
            {session.date} · {cfg.startTime}–11:00 · {cfg.rounds}게임
          </p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>{now ? `${now}` : '–'}</b>
            <span>지금 게임</span>
          </div>
          <div className="tcm-count">
            <b>
              {done}
              <span style={{ fontSize: 18 }}> / {matches.length}</span>
            </b>
            <span>점수 완료</span>
          </div>
        </div>
      </header>

      {nowMatches.length > 0 ? (
        <>
          <p className="tcm-section-title">지금 경기 — {now}게임 ({roundTime(cfg, now)})</p>
          <div className="tcm-courts">{nowMatches.map((m) => tile(m, true))}</div>
        </>
      ) : (
        <p className="tcm-hint">
          지금은 경기 시간이 아닙니다. 아래 전체 대진표에서 점수를 입력할 수 있습니다.
        </p>
      )}

      {nextMatches.length > 0 && (
        <>
          <p className="tcm-section-title">
            다음 경기 — {nextRound}게임 ({roundTime(cfg, nextRound)})
          </p>
          <div className="tcm-courts">{nextMatches.map((m) => tile(m, false))}</div>
        </>
      )}

      {/* 점수가 아직 없어도 자리는 항상 보여 줍니다 (REQ-ADMIN-001 B: 남/여 당일 1~3위 상시 표시) */}
      <p className="tcm-section-title">오늘의 순위</p>
      <div className="tcm-grid">
        <TopCard label="남자" rows={top('M')} />
        <TopCard label="여자" rows={top('F')} />
      </div>

      <p className="tcm-section-title">전체 대진표</p>
      {rounds.map(([round, list]) => (
        <section key={round} className={'tcm-round' + (now === round ? ' tcm-round--now' : '')}>
          <div className="tcm-round-head">
            <h3>{round}게임</h3>
            <span>{roundTime(cfg, round)}</span>
            {now === round && <span className="tcm-tag">진행 중</span>}
          </div>
          <div className="tcm-courts">{list.map((m) => tile(m, false))}</div>
        </section>
      ))}

    </div>
  );
}

function TopCard({ label, rows }) {
  return (
    <div className="tcm-stat">
      <span>{label} 당일 순위</span>
      {rows.length === 0 ? (
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14 }}>아직 결과가 없습니다</p>
      ) : (
        <ol className="tcm-top">
          {rows.map((r) => (
            <li key={r.id}>
              <b>{r.rank}위</b> {r.name}
              {r.guest && <span className="tcm-g">G</span>}
              <span>
                {r.gamesWon}점 · 평균 {r.avg.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MatchTile({ match, big, cfg, nameOf, isG, unlocked, onScore, onUnlock }) {
  const done = isMatchDone(match);
  const locked = done && !unlocked; // 확정된 점수는 '점수 수정'을 눌러야 고칠 수 있습니다 (C항)
  const winner = matchWinner(match);

  const side = (s) => {
    const team = s === 'A' ? match.teamA : match.teamB;
    const score = s === 'A' ? match.scoreA : match.scoreB;
    return (
      <div className={'tcm-team' + (winner === s ? ' tcm-team--win' : '')}>
        <span className="tcm-team-names">
          {team.map((id, i) => (
            <span key={id}>
              {i > 0 && ' · '}
              {nameOf(id)}
              {isG(id) && <span className="tcm-g">G</span>}
            </span>
          ))}
        </span>
        {locked ? (
          <span className="tcm-score tcm-score--locked">{score}</span>
        ) : (
          <input
            className="tcm-score"
            type="number"
            inputMode="numeric"
            min="0"
            max="99"
            placeholder="–"
            aria-label={`${team.map(nameOf).join(', ')} 점수`}
            value={score === null ? '' : score}
            onChange={(e) => onScore(match.id, s === 'A' ? 'scoreA' : 'scoreB', e.target.value)}
          />
        )}
      </div>
    );
  };

  return (
    <div className={'tcm-match' + (big ? ' tcm-match--big tcm-match--now' : '') + (done ? ' tcm-match--done' : '')}>
      <div className="tcm-match-head">
        <b>{courtName(cfg, match.court)}코트</b>
        <span className={'tcm-tag' + (match.type === 'XD' ? ' tcm-tag--mixed' : '')}>
          {MATCH_TYPE_LABEL[match.type]}
        </span>
        <span className="tcm-spacer" />
        {locked && (
          <button type="button" className="tcm-btn tcm-btn--small" onClick={() => onUnlock(match.id)}>
            점수 수정
          </button>
        )}
        {!done && <span className="tcm-tag">점수 입력 가능</span>}
      </div>
      {side('A')}
      <div className="tcm-vs">vs</div>
      {side('B')}
    </div>
  );
}

