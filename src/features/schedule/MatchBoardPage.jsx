import { useMemo, useState } from 'react';
import {
  MATCH_TYPE_LABEL,
  courtName,
  roundTime,
  currentRound,
  isMatchDone,
  matchWinner,
  publishDirty,
  isPublished,
  publishPayload,
  isLive,
  activeRound,
} from '../../lib/session';
import { allPlayers } from '../../lib/guests';

/**
 * 대진표 · 점수 입력
 * §9 현장 운영 원칙
 *   · 점수 입력은 항상 가능
 *   · 대진 수정은 '대진 수정' 버튼을 눌러야만 가능
 *   · PIN, 관리자 인증, 3초 누르기 없음
 */
export default function MatchBoardPage({ db, session, updateSession, go }) {
  const [editMode, setEditMode] = useState(false);
  const cfg = session.config;
  const nameOf = (id) => allPlayers(db).find((m) => m.id === id)?.name || '(삭제됨)';
  const live = isLive(session);
  const now = activeRound(session);

  const rounds = useMemo(() => {
    const map = new Map();
    for (const m of session.matches) {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round).push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [session.matches]);

  const done = session.matches.filter(isMatchDone).length;

  function setScore(id, side, raw) {
    const v = raw === '' ? null : Math.max(0, Math.min(99, Number(raw)));
    if (raw !== '' && Number.isNaN(v)) return;
    updateSession({
      matches: session.matches.map((m) => (m.id === id ? { ...m, [side]: v } : m)),
    });
  }

  function clearScore(id) {
    updateSession({
      matches: session.matches.map((m) => (m.id === id ? { ...m, scoreA: null, scoreB: null } : m)),
    });
  }

  /** 자리 바꾸기. 같은 라운드에 이미 있는 사람을 고르면 두 사람이 서로 자리를 바꿉니다. */
  function assign(matchId, team, idx, newId) {
    const target = session.matches.find((m) => m.id === matchId);
    const curId = target[team][idx];
    if (!newId || newId === curId) return;

    const next = session.matches.map((m) => {
      if (m.round !== target.round) return m;
      const copy = { ...m, teamA: [...m.teamA], teamB: [...m.teamB] };
      // 같은 라운드에서 newId가 있던 자리에 원래 있던 사람을 넣는다 (맞교환)
      for (const t of ['teamA', 'teamB']) {
        copy[t] = copy[t].map((id) => (id === newId ? curId : id));
      }
      if (copy.id === matchId) copy[team][idx] = newId;
      return copy;
    });
    updateSession({ matches: next });
  }

  if (session.matches.length === 0) {
    return (
      <>
        <header className="tcm-head">
          <div>
            <h1 className="tcm-title">대진표 · 점수</h1>
            <p className="tcm-sub">{session.date}</p>
          </div>
        </header>
        <p className="tcm-empty">
          이 날짜에는 아직 대진이 없습니다.
          <br />
          <button type="button" className="tcm-btn tcm-btn--primary" style={{ marginTop: 14 }} onClick={() => go('schedule')}>
            자동 대진 만들러 가기
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">대진표 · 점수</h1>
          <p className="tcm-sub">
            {session.date} · {cfg.courts}코트 · {cfg.rounds}게임
            {now ? ` · 지금 ${now}게임 진행 중` : ''}
          </p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>
              {done}
              <span style={{ fontSize: 18 }}> / {session.matches.length}</span>
            </b>
            <span>점수 입력 완료</span>
          </div>
        </div>
      </header>

      {publishDirty(session) && (
        <div className="tcm-publish">
          <p>
            {isPublished(session)
              ? '대진을 고쳤습니다. 아직 현장 화면에는 예전 대진이 떠 있습니다.'
              : '이 대진은 아직 현장에 공개되지 않았습니다.'}
          </p>
          <button
            type="button"
            className="tcm-btn tcm-btn--primary"
            onClick={() => updateSession({ published: publishPayload(session) })}
          >
            {isPublished(session) ? '수정 확정 및 공개 반영' : '대진 확정 및 현장 공개'}
          </button>
        </div>
      )}

      {/* 운영모드 (PM 결정) — 운영 중에는 회원·참석·편성이 잠기고 점수 입력만 됩니다 */}
      <div className={'tcm-publish' + (live ? ' tcm-publish--live' : '')}>
        {live ? (
          <>
            <p>
              <b>운영 중 — {now}게임 진행 중</b>
              <br />
              회원·참석·자동편성이 잠겨 있습니다. 점수 입력만 됩니다. 이 게임이 끝나면 ‘경기 종료’를 누르세요.
            </p>
            <button
              type="button"
              className="tcm-btn tcm-btn--primary"
              disabled={now >= cfg.rounds}
              onClick={() => updateSession({ liveRound: Math.min((session.liveRound || 1) + 1, cfg.rounds) })}
            >
              {now >= cfg.rounds ? '마지막 게임입니다' : `경기 종료 → ${now + 1}게임 시작`}
            </button>
            <button
              type="button"
              className="tcm-btn"
              onClick={() => {
                if (window.confirm('오늘 운영을 끝냅니다.\n회원·참석·편성을 다시 고칠 수 있게 됩니다.\n계속할까요?'))
                  updateSession({ mode: 'prep' });
              }}
            >
              운영 종료
            </button>
          </>
        ) : (
          <>
            <p>
              점수는 언제든 바로 입력할 수 있습니다. 사람을 바꾸려면 ‘대진 수정’을 누르세요.
              <br />
              경기를 시작하면 <b>‘운영 시작’</b>을 누르세요. 실수로 명단이나 대진이 바뀌는 것을 막아 줍니다.
            </p>
            <button
              type="button"
              className="tcm-btn"
              aria-pressed={editMode}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? '대진 수정 끝내기' : '대진 수정'}
            </button>
            <button
              type="button"
              className="tcm-btn tcm-btn--primary"
              disabled={!session.matches.length}
              onClick={() => updateSession({ mode: 'live', liveRound: 1 })}
            >
              운영 시작
            </button>
          </>
        )}
      </div>

      {editMode && (
        <p className="tcm-hint tcm-hint--alert">
          대진 수정 중입니다. 사람을 고르면 같은 게임 시간 안에서 서로 자리가 바뀝니다. 다 고쳤으면 ‘대진 수정
          끝내기’를 누르세요.
        </p>
      )}

      {rounds.map(([round, list]) => {
        const playing = new Set(list.flatMap((m) => [...m.teamA, ...m.teamB]));
        const resting = session.attendance.filter((id) => !playing.has(id));
        return (
          <section key={round} className={'tcm-round' + (now === round ? ' tcm-round--now' : '')}>
            <div className="tcm-round-head">
              <h3>{round}게임</h3>
              <span>{roundTime(cfg, round)}</span>
              {now === round && <span className="tcm-tag">진행 중</span>}
            </div>

            <div className="tcm-courts">
              {list.map((m) => (
                <MatchCard
                  key={m.id}
                  cfg={cfg}
                  match={m}
                  nameOf={nameOf}
                  editMode={editMode && !live}
                  now={now === round}
                  roster={session.attendance.map((id) => ({ id, name: nameOf(id) }))}
                  onScore={setScore}
                  onClear={clearScore}
                  onAssign={assign}
                />
              ))}
            </div>

            {resting.length > 0 && (
              <p className="tcm-rest">쉬는 사람 {resting.length}명 — {resting.map(nameOf).join(', ')}</p>
            )}
          </section>
        );
      })}

      <div className="tcm-tools">
        <span className="tcm-spacer" />
        <button type="button" className="tcm-btn tcm-btn--primary" onClick={() => go('ranking')}>
          랭킹 보기
        </button>
      </div>
    </>
  );
}

/**
 * 한 팀 줄 (이름 + 점수 칸)
 * ★ 이 컴포넌트는 반드시 파일 맨 바깥에 있어야 합니다.
 *   MatchCard 안에 함수를 만들면 화면이 다시 그려질 때마다 React가 입력칸을 통째로 새로 만들어서,
 *   점수를 치는 도중에 커서가 튕기고 두 번째 숫자가 안 들어갑니다. (실제로 발생했던 버그)
 */
function TeamRow({ match, side, nameOf, onScore }) {
  const team = side === 'A' ? match.teamA : match.teamB;
  const score = side === 'A' ? match.scoreA : match.scoreB;
  const win = matchWinner(match) === side;
  const names = team.map(nameOf).join(' · ');
  return (
    <div className={'tcm-team' + (win ? ' tcm-team--win' : '')}>
      <span className="tcm-team-names">
        {names}
        {win && (
          <span className="tcm-tag" style={{ marginLeft: 8 }}>
            승
          </span>
        )}
      </span>
      <input
        className="tcm-score"
        type="number"
        inputMode="numeric"
        min="0"
        max="99"
        placeholder="–"
        aria-label={`${names} 점수`}
        value={score === null ? '' : score}
        onChange={(e) => onScore(match.id, side === 'A' ? 'scoreA' : 'scoreB', e.target.value)}
      />
    </div>
  );
}

function MatchCard({ match, cfg, nameOf, editMode, now, roster, onScore, onClear, onAssign }) {
  const done = isMatchDone(match);

  return (
    <div className={'tcm-match' + (now ? ' tcm-match--now' : '') + (done ? ' tcm-match--done' : '')}>
      <div className="tcm-match-head">
        <b>{courtName(cfg, match.court)}코트</b>
        <span className={'tcm-tag' + (match.type === 'XD' ? ' tcm-tag--mixed' : '')}>
          {MATCH_TYPE_LABEL[match.type]}
        </span>
        {match.type === 'XD' && match.mixedReason && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }} title={match.mixedReason}>
            사유 있음
          </span>
        )}
        <span className="tcm-spacer" />
        {done && (
          <button
            type="button"
            className="tcm-btn tcm-btn--small"
            onClick={() => onClear(match.id)}
          >
            점수 지우기
          </button>
        )}
      </div>

      <TeamRow match={match} side="A" nameOf={nameOf} onScore={onScore} />
      <div className="tcm-vs">vs</div>
      <TeamRow match={match} side="B" nameOf={nameOf} onScore={onScore} />

      {editMode && (
        <div className="tcm-swap">
          {['teamA', 'teamB'].map((t) =>
            match[t].map((id, idx) => (
              <select
                key={t + idx}
                className="tcm-select"
                value={id}
                onChange={(e) => onAssign(match.id, t, idx, e.target.value)}
              >
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ))
          )}
        </div>
      )}
    </div>
  );
}
