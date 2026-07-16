import { useMemo } from 'react';
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
} from '../../lib/session';
import { computeRanking, rerank } from '../../lib/ranking';
import { allPlayers } from '../../lib/guests';

/**
 * 회원 모바일 조회 (/view) — 읽기 전용
 * 공개된 대진과 점수, 당일 순위만 봅니다. 아무것도 고칠 수 없습니다. (F항)
 * 점수 입력은 현장 공개 대시보드(/display)에서만 합니다.
 */
export default function ViewPage({ db, session }) {
  const cfg = session.config;
  const matches = useMemo(() => publishedMatches(session), [session]);
  const players = allPlayers(db);
  const nameOf = (id) => players.find((m) => m.id === id)?.name || '(알 수 없음)';
  const isG = (id) => !!players.find((m) => m.id === id)?.guest;
  const now = activeRound(session);
  const rank = useMemo(() => computeRanking(players, matches), [db.members, db.guests, matches]);

  const rounds = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round).push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  if (!isPublished(session)) {
    return (
      <>
        <header className="tcm-head">
          <div>
            <h1 className="tcm-title">{CLUB_NAME}</h1>
            <p className="tcm-sub">{session.date}</p>
          </div>
        </header>
        <p className="tcm-empty">아직 대진이 공개되지 않았습니다.</p>
      </>
    );
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">{CLUB_NAME}</h1>
          <p className="tcm-sub">
            {session.date} · {cfg.startTime}–11:00 · 대진표
          </p>
        </div>
      </header>

      {rounds.map(([round, list]) => (
        <section key={round} className={'tcm-round' + (now === round ? ' tcm-round--now' : '')}>
          <div className="tcm-round-head">
            <h3>{round}게임</h3>
            <span>{roundTime(cfg, round)}</span>
            {now === round && <span className="tcm-tag">진행 중</span>}
          </div>
          <div className="tcm-courts">
            {list.map((m) => {
              const w = matchWinner(m);
              return (
                <div key={m.id} className={'tcm-match' + (isMatchDone(m) ? ' tcm-match--done' : '')}>
                  <div className="tcm-match-head">
                    <b>{courtName(cfg, m.court)}코트</b>
                    <span className={'tcm-tag' + (m.type === 'XD' ? ' tcm-tag--mixed' : '')}>
                      {MATCH_TYPE_LABEL[m.type]}
                    </span>
                    <span className="tcm-spacer" />
                    {isMatchDone(m) && (
                      <span className="tcm-tag">
                        {m.scoreA} : {m.scoreB}
                      </span>
                    )}
                  </div>
                  <div className={'tcm-team' + (w === 'A' ? ' tcm-team--win' : '')}>
                    <span className="tcm-team-names">
                      {m.teamA.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ' · '}
                          {nameOf(id)}
                          {isG(id) && <span className="tcm-g">G</span>}
                        </span>
                      ))}
                    </span>
                    <span className="tcm-score tcm-score--locked">{m.scoreA ?? '–'}</span>
                  </div>
                  <div className="tcm-vs">vs</div>
                  <div className={'tcm-team' + (w === 'B' ? ' tcm-team--win' : '')}>
                    <span className="tcm-team-names">
                      {m.teamB.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ' · '}
                          {nameOf(id)}
                          {isG(id) && <span className="tcm-g">G</span>}
                        </span>
                      ))}
                    </span>
                    <span className="tcm-score tcm-score--locked">{m.scoreB ?? '–'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="tcm-section-title">오늘의 순위</p>
      <div className="tcm-grid">
        {['M', 'F'].map((g) => (
          <div key={g} className="tcm-stat">
            <span>{g === 'M' ? '남자' : '여자'} 당일 순위</span>
            <ol className="tcm-top">
              {rerank(rank.filter((r) => r.gender === g && r.played > 0))
                .slice(0, 3)
                .map((r) => (
                  <li key={r.id}>
                    <b>{r.rank}위</b> {r.name}
                    {r.guest && <span className="tcm-g">G</span>}
                    <span>
                      {r.gamesWon}점 · 평균 {r.avg.toFixed(1)}
                    </span>
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="tcm-foot">점수 입력은 현장 태블릿에서 합니다.</p>
    </>
  );
}
