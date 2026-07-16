import { useMemo, useState } from 'react';
import { computeRanking, computeCumulative, sessionDates } from '../../lib/ranking';
import { genderLabel } from '../../lib/members';
import { isMatchDone } from '../../lib/session';
import { allPlayers } from '../../lib/guests';

/**
 * 랭킹 화면
 *  · 당일: 고른 날짜 하루치
 *  · 누적: 대진이 만들어진 모든 운영일 합산 (세션이 날짜별로 저장돼 있어 합산만 하면 됨)
 * 순위 기준은 두 화면이 완전히 동일합니다. (lib/ranking.js 의 comparePlayers)
 */
export default function RankingPage({ db, session, go }) {
  const [mode, setMode] = useState('day');

  const dates = useMemo(() => sessionDates(db.sessions), [db.sessions]);
  const dayRows = useMemo(() => computeRanking(allPlayers(db), session.matches), [db.members, db.guests, session.matches]);
  const totalRows = useMemo(
    () => computeCumulative(allPlayers(db), db.sessions, dates),
    [db.members, db.guests, db.sessions, dates]
  );

  const rows = mode === 'day' ? dayRows : totalRows;
  const done = session.matches.filter(isMatchDone).length;
  const totalMatches = dates.reduce((a, d) => a + (db.sessions[d].matches || []).length, 0);

  // 아직 아무 날짜에도 대진이 없는 경우
  if (dates.length === 0 && session.matches.length === 0) {
    return (
      <>
        <header className="tcm-head">
          <div>
            <h1 className="tcm-title">랭킹</h1>
            <p className="tcm-sub">{session.date}</p>
          </div>
        </header>
        <p className="tcm-empty">
          아직 대진이 하나도 없습니다.
          <br />
          <button
            type="button"
            className="tcm-btn tcm-btn--primary"
            style={{ marginTop: 14 }}
            onClick={() => go('schedule')}
          >
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
          <h1 className="tcm-title">{mode === 'day' ? '당일 랭킹' : '누적 랭킹'}</h1>
          <p className="tcm-sub">
            {mode === 'day'
              ? `${session.date} · ${done}/${session.matches.length}경기 점수 입력됨`
              : dates.length === 0
                ? '합산할 운영일이 없습니다'
                : `운영일 ${dates.length}일 합산 · ${dates[0]} ~ ${dates[dates.length - 1]} · 총 ${totalMatches}경기`}
          </p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>{rows.length}</b>
            <span>명</span>
          </div>
        </div>
      </header>

      <div className="tcm-tools">
        <div className="tcm-seg" role="group" aria-label="랭킹 종류">
          <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>
            당일
          </button>
          <button type="button" aria-pressed={mode === 'total'} onClick={() => setMode('total')}>
            누적
          </button>
        </div>
        <span className="tcm-spacer" />
      </div>

      <p className="tcm-hint">
        <b>공식 순위 기준</b> — ① 총 획득 게임포인트 → ② 경기당 평균 → ③ 같으면 공동순위.
        <br />
        승·무·패와 득실차는 <b>참고 통계</b>일 뿐 순위에 쓰지 않습니다. 5:5(해피게임)는 무승부입니다.
        {mode === 'day' && done < session.matches.length && ' 아직 점수가 안 들어온 경기가 있어 순위는 바뀔 수 있습니다.'}
        {mode === 'total' && ' 게스트는 누적 순위에서 제외됩니다.'}
      </p>

      {mode === 'day' && session.matches.length === 0 && (
        <p className="tcm-hint tcm-hint--alert">
          {session.date} 에는 대진이 없습니다. 위에서 ‘누적’을 누르면 지난 운영일 합산 순위를 볼 수 있습니다.
        </p>
      )}

      {/* 폰처럼 좁은 화면에서는 표가 잘리지 않게 좌우로 밀어서 봅니다 */}
      <div className="tcm-scroll">
        <table className="tcm-table">
          <thead>
            <tr>
              <th>순위</th>
              <th>이름</th>
              {mode === 'total' && <th>참석일</th>}
              <th>게임포인트</th>
              <th>경기당 평균</th>
              <th>경기</th>
              <th>승</th>
              <th>무</th>
              <th>패</th>
              <th>득실</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.played === 0 ? '–' : r.rank}</td>
                <td>
                  <span
                    className={`tcm-badge tcm-badge--${r.gender}`}
                    style={{
                      width: 22,
                      height: 22,
                      fontSize: 11,
                      display: 'inline-grid',
                      verticalAlign: 'middle',
                      marginRight: 8,
                    }}
                  >
                    {genderLabel(r.gender)}
                  </span>
                  {r.name}
                  {r.guest && <span className="tcm-g">G</span>}
                </td>
                {mode === 'total' && <td>{r.days}일</td>}
                <td>
                  <b style={{ fontSize: 17 }}>{r.gamesWon}</b>
                </td>
                <td>{r.played ? r.avg.toFixed(2) : '–'}</td>
                <td>{r.played}</td>
                <td>{r.win}</td>
                <td>{r.draw}</td>
                <td>{r.lose}</td>
                <td style={{ color: r.diff > 0 ? 'var(--ok)' : r.diff < 0 ? 'var(--alert)' : 'inherit' }}>
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === 'total' && dates.length > 0 && (
        <>
          <p className="tcm-section-title">합산에 들어간 운영일</p>
          <p className="tcm-hint">{dates.join(' · ')}</p>
        </>
      )}
    </>
  );
}
