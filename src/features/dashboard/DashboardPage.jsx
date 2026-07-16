import { useEffect, useMemo, useState } from 'react';
import { MATCH_TYPE_LABEL, courtName, roundTime, activeRound, isLive, isMatchDone } from '../../lib/session';
import { computeRanking } from '../../lib/ranking';
import { createMember } from '../../lib/members';
import { isCodeSet, withCode, setUnlocked } from '../../lib/adminAccess';
import { allPlayers } from '../../lib/guests';

/** 현장 대시보드 — 코트 옆에 세워두고 보는 화면 */
export default function DashboardPage({ db, setDb, session, date, setDate, go, lock }) {
  const [, tick] = useState(0);
  // 1분마다 '지금 몇 게임 중'을 다시 계산합니다
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const cfg = session.config;
  const now = activeRound(session);
  const nameOf = (id) => allPlayers(db).find((m) => m.id === id)?.name || '(삭제됨)';

  const done = session.matches.filter(isMatchDone).length;
  const pct = session.matches.length ? Math.round((done / session.matches.length) * 100) : 0;

  const nowMatches = session.matches.filter((m) => m.round === now);
  const nextRound = now ? now + 1 : session.matches.length ? 1 : null;
  const nextMatches = session.matches.filter((m) => m.round === nextRound);

  const top = useMemo(
    () => computeRanking(allPlayers(db), session.matches).filter((r) => r.played > 0).slice(0, 3),
    [db.members, session.matches]
  );

  // 지난 운영일 목록 — 참석이나 대진이 하나라도 있는 날짜만, 최근 날짜부터
  const days = useMemo(
    () =>
      Object.keys(db.sessions)
        .filter((d) => (db.sessions[d].attendance?.length || 0) + (db.sessions[d].matches?.length || 0) > 0)
        .sort()
        .reverse()
        .slice(0, 8),
    [db.sessions]
  );

  const resting = (list) => {
    const playing = new Set(list.flatMap((m) => [...m.teamA, ...m.teamB]));
    return session.attendance.filter((id) => !playing.has(id));
  };

  /**
   * 오늘 눌러볼 수 있게 하는 샘플 명단.
   * sample: true 표시를 남겨서, 나중에 회원관리에서 '샘플만 골라 지우기'가 가능합니다.
   */
  function seed() {
    const men = ['김진우', '박성호', '이도현', '최민석', '정재훈', '강태윤', '윤상호', '임경택', '오세영'];
    const women = ['한지민', '서예린', '문가영', '배수지', '노윤서'];
    setDb({
      ...db,
      members: [
        ...db.members,
        ...men.map((n) => ({ ...createMember({ name: n, gender: 'M' }), sample: true })),
        ...women.map((n) => ({ ...createMember({ name: n, gender: 'F' }), sample: true })),
      ],
    });
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">{date} 운영</h1>
          <p className="tcm-sub">
            {cfg.startTime}–11:00 · {cfg.courts}코트 · {cfg.rounds}게임 · 30분
          </p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>{now ? `${now}` : '–'}</b>
            <span>지금 게임</span>
          </div>
          <div className="tcm-count">
            <b>{session.attendance.length}</b>
            <span>참석</span>
          </div>
        </div>
      </header>

      {db.members.length === 0 && (
        <div className="tcm-card">
          <p style={{ margin: '0 0 12px', lineHeight: 1.7 }}>
            아직 회원이 없습니다. 회원관리에서 한 명씩 넣거나, 지금 바로 눌러보고 싶으면 샘플 명단
            14명(남 9 · 여 5)을 넣어 전체 흐름을 시험해 볼 수 있습니다.
          </p>
          <div className="tcm-tools" style={{ marginTop: 0 }}>
            <button type="button" className="tcm-btn tcm-btn--primary" onClick={seed}>
              샘플 명단 14명 넣기
            </button>
            <button type="button" className="tcm-btn" onClick={() => go('members')}>
              직접 넣기
            </button>
          </div>
        </div>
      )}

      {session.matches.length === 0 && db.members.length > 0 && (
        <div className="tcm-card">
          <p style={{ margin: '0 0 12px', lineHeight: 1.7 }}>
            {session.attendance.length < 4
              ? '이 날짜에 참석자가 아직 없습니다. 참석관리에서 오늘 나오는 사람을 체크하세요.'
              : `참석 ${session.attendance.length}명이 확정되어 있습니다. 이제 자동 대진을 만드세요.`}
          </p>
          <div className="tcm-tools" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="tcm-btn tcm-btn--primary"
              onClick={() => go(session.attendance.length < 4 ? 'attendance' : 'schedule')}
            >
              {session.attendance.length < 4 ? '참석 체크하러 가기' : '자동 대진 만들기'}
            </button>
          </div>
        </div>
      )}

      {session.matches.length > 0 && (
        <>
          <div className="tcm-grid">
            <div className="tcm-stat">
              <span>점수 입력</span>
              <b>
                {done}
                <small style={{ fontSize: 18, color: 'var(--muted)' }}> / {session.matches.length}</small>
              </b>
              <div className="tcm-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="tcm-stat">
              <span>전체 점수 (내부 v1)</span>
              <b>{session.report ? session.report.score : '–'}</b>
              <span>{session.report ? `${session.report.max}점 만점 · 공식 점수 아님` : '자동 편성 전'}</span>
            </div>
            <div className="tcm-stat">
              <span>경기 수 균형</span>
              <b>
                {session.report ? `${session.report.balance.min}–${session.report.balance.max}` : '–'}
              </b>
              <span>{session.report ? `1인당 게임 수 (평균 ${session.report.balance.avg})` : ''}</span>
            </div>
            <div className="tcm-stat">
              <span>혼복</span>
              <b>{session.report ? session.report.mixedCount : '–'}</b>
              <span>{session.report?.mixedCount ? '사유 기록됨 · 벌점 없음' : '없음'}</span>
            </div>
          </div>

          <p className="tcm-section-title">
            {now ? `지금 — ${now}게임 (${roundTime(cfg, now)})` : '운영 시간이 아닙니다'}
          </p>
          {nowMatches.length > 0 ? (
            <div className="tcm-courts" style={{ marginTop: 12 }}>
              {nowMatches.map((m) => (
                <Card key={m.id} m={m} nameOf={nameOf} cfg={cfg} />
              ))}
            </div>
          ) : (
            <p className="tcm-hint">
              지금 시각({new Date().toTimeString().slice(0, 5)})은 {cfg.startTime} 시작 · {cfg.rounds}게임 운영
              시간 밖입니다. 대진표는 ‘대진표 · 점수’ 화면에서 전부 볼 수 있습니다.
            </p>
          )}
          {nowMatches.length > 0 && resting(nowMatches).length > 0 && (
            <p className="tcm-rest">쉬는 사람 — {resting(nowMatches).map(nameOf).join(', ')}</p>
          )}

          {nextMatches.length > 0 && (
            <>
              <p className="tcm-section-title">
                다음 — {nextRound}게임 ({roundTime(cfg, nextRound)})
              </p>
              <div className="tcm-courts" style={{ marginTop: 12 }}>
                {nextMatches.map((m) => (
                  <Card key={m.id} m={m} nameOf={nameOf} cfg={cfg} />
                ))}
              </div>
            </>
          )}

          {top.length > 0 && (
            <>
              <p className="tcm-section-title">현재 상위</p>
              <div className="tcm-grid">
                {top.map((r) => (
                  <div key={r.id} className="tcm-stat">
                    <span>{r.rank}위</span>
                    <b style={{ fontSize: 24 }}>{r.name}</b>
                    <span>
                      {r.win}승 {r.lose}패 · 득실 {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="tcm-tools">
            <span className="tcm-spacer" />
            <button type="button" className="tcm-btn" onClick={() => go('ranking')}>
              랭킹
            </button>
            <button type="button" className="tcm-btn tcm-btn--primary" onClick={() => go('board')}>
              점수 입력
            </button>
          </div>
        </>
      )}

      {/* 운영진 설정 — 관리자 화면에만 있습니다 (PM 결정 ⑥) */}
      <p className="tcm-section-title">운영진 설정</p>
      <div className="tcm-card">
        <p style={{ margin: '0 0 12px', lineHeight: 1.7, fontSize: 14, color: 'var(--muted)' }}>
          관리자 화면 접근코드: <b style={{ color: 'var(--ink)' }}>{isCodeSet(db) ? '설정됨' : '없음 (누구나 들어올 수 있음)'}</b>
          <br />
          코드를 정해두면 이 화면(#/admin)에 들어올 때만 물어봅니다. 점수 입력과 현장 화면은 코드 없이 그대로 씁니다.
        </p>
        <div className="tcm-tools" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="tcm-btn tcm-btn--primary"
            onClick={() => {
              const code = window.prompt(
                isCodeSet(db) ? '새 접근코드를 입력하세요. (숫자 4자리 권장)' : '접근코드를 정하세요. (숫자 4자리 권장)'
              );
              if (code === null) return;
              if (!code.trim()) return window.alert('빈 코드는 쓸 수 없습니다.');
              setDb(withCode(db, code.trim()));
              setUnlocked(true);
              window.alert('접근코드를 저장했습니다. 잊어버리면 이 기기에서 다시 설정해야 하니 적어두세요.');
            }}
          >
            {isCodeSet(db) ? '접근코드 변경' : '접근코드 설정'}
          </button>
          {isCodeSet(db) && (
            <>
              <button
                type="button"
                className="tcm-btn"
                onClick={() => {
                  setUnlocked(false);
                  lock?.();
                }}
              >
                이 기기 잠그기
              </button>
              <button
                type="button"
                className="tcm-btn tcm-btn--danger tcm-btn--small"
                onClick={() => {
                  if (window.confirm('접근코드를 없앱니다.\n누구나 관리자 화면에 들어올 수 있게 됩니다.\n계속할까요?')) {
                    setDb(withCode(db, null));
                    setUnlocked(false);
                  }
                }}
              >
                코드 해제
              </button>
            </>
          )}
        </div>
      </div>

      {days.length > 0 && (
        <>
          <p className="tcm-section-title">지난 운영일</p>
          <ul className="tcm-list">
            {days.map((d) => {
              const s2 = db.sessions[d];
              const total = s2.matches?.length || 0;
              const scored = (s2.matches || []).filter(isMatchDone).length;
              return (
                <li key={d} className={'tcm-row' + (d === date ? ' tcm-row--resting' : '')} style={{ padding: 0 }}>
                  <button type="button" className="tcm-row-link" onClick={() => setDate(d)}>
                    <span className="tcm-name">
                      {d}
                      {d === date && <span className="tcm-tag" style={{ marginLeft: 8 }}>보는 중</span>}
                    </span>
                    <span className="tcm-tag">참석 {s2.attendance?.length || 0}명</span>
                    <span className="tcm-tag">
                      {total > 0 ? `점수 ${scored}/${total}` : '대진 없음'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="tcm-hint">
            날짜를 누르면 그날의 참석·대진·점수·랭킹을 그대로 볼 수 있습니다. 지난 기록은 지워지지 않습니다.
          </p>
        </>
      )}
    </>
  );
}

function Card({ m, nameOf, cfg }) {
  return (
    <div className={'tcm-match' + (isMatchDone(m) ? ' tcm-match--done' : ' tcm-match--now')}>
      <div className="tcm-match-head">
        <b>{cfg ? courtName(cfg, m.court) : m.court}코트</b>
        <span className={'tcm-tag' + (m.type === 'XD' ? ' tcm-tag--mixed' : '')}>{MATCH_TYPE_LABEL[m.type]}</span>
        <span className="tcm-spacer" />
        {isMatchDone(m) && (
          <span className="tcm-tag">
            {m.scoreA} : {m.scoreB}
          </span>
        )}
      </div>
      <div className="tcm-team">
        <span className="tcm-team-names">{m.teamA.map(nameOf).join(' · ')}</span>
      </div>
      <div className="tcm-vs">vs</div>
      <div className="tcm-team">
        <span className="tcm-team-names">{m.teamB.map(nameOf).join(' · ')}</span>
      </div>
    </div>
  );
}
