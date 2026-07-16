import { useMemo } from 'react';
import { sortMembers, genderLabel } from '../../lib/members';
import { pickablePlayers } from '../../lib/guests';
import { getSession } from '../../lib/session';

/** 참석관리 — 수요일에 확정된 일요일 참석자를 체크합니다. (§7) */
export default function AttendancePage({ db, date, setDate, session, updateSession, go }) {
  // 정규회원 + 게스트 모두 참석 체크 대상입니다
  const roster = useMemo(() => sortMembers(pickablePlayers(db)), [db.members, db.guests]);
  const picked = new Set(session.attendance);

  const men = roster.filter((m) => m.gender === 'M' && picked.has(m.id)).length;
  const women = roster.filter((m) => m.gender === 'F' && picked.has(m.id)).length;
  const total = men + women;

  const slots = session.config.courts * session.config.rounds * 4; // 2코트 × 6게임 × 4명 = 48
  const perPerson = total > 0 ? slots / total : 0;
  const locked = session.matches.length > 0;

  const toggle = (id) => {
    const next = new Set(session.attendance);
    next.has(id) ? next.delete(id) : next.add(id);
    updateSession({ attendance: [...next] });
  };

  /** 지난 운영일 명단 그대로 가져오기 — 매주 거의 같은 사람이 옵니다 */
  function copyLast() {
    const prevDate = Object.keys(db.sessions)
      .filter((d) => d < date && db.sessions[d].attendance?.length)
      .sort()
      .pop();
    if (!prevDate) return window.alert('가져올 지난 명단이 없습니다.');
    const still = getSession(db, prevDate).attendance.filter((id) =>
      db.members.some((m) => m.id === id && m.status === 'active')
    );
    updateSession({ attendance: still });
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">참석관리</h1>
          <p className="tcm-sub">
            {session.config.startTime}–11:00 · {session.config.courts}코트 · {session.config.rounds}게임
          </p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>{men}</b>
            <span>남</span>
          </div>
          <div className="tcm-count">
            <b>{women}</b>
            <span>여</span>
          </div>
          <div className="tcm-count">
            <b>{total}</b>
            <span>참석</span>
          </div>
        </div>
      </header>

      <div className="tcm-tools">
        <input
          className="tcm-input"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ flex: '0 1 200px' }}
        />
        <button type="button" className="tcm-btn" onClick={copyLast}>
          지난 명단 가져오기
        </button>
        <button
          type="button"
          className="tcm-btn"
          onClick={() => updateSession({ attendance: roster.map((m) => m.id) })}
        >
          전체 참석
        </button>
        <button type="button" className="tcm-btn" onClick={() => updateSession({ attendance: [] })}>
          전체 해제
        </button>
      </div>

      <p className="tcm-hint">
        {total < 4
          ? '4명 이상이어야 대진을 만들 수 있습니다.'
          : `한 사람당 평균 ${perPerson.toFixed(1)}게임을 뛰게 됩니다. (전체 ${slots}자리 ÷ ${total}명)`}
        {total >= 4 && (men % 4 !== 0 || women % 4 !== 0) &&
          ' 남녀 인원이 4명 단위로 딱 떨어지지 않아 일부는 혼복으로 편성됩니다.'}
      </p>

      {locked && (
        <p className="tcm-hint tcm-hint--alert">
          이 날짜는 이미 대진이 만들어졌습니다. 참석자를 바꾸면 ‘자동 대진’ 화면에서 다시 편성해야 합니다.
        </p>
      )}

      <div className="tcm-chips">
        {roster.length === 0 && (
          <p className="tcm-empty" style={{ width: '100%' }}>
            회원 명단이 비어 있습니다. 회원관리에서 먼저 회원을 넣어 주세요. (게스트는 ‘게스트’ 탭에서 추가합니다)
          </p>
        )}
        {roster.map((m) => (
          <button
            key={m.id}
            type="button"
            className="tcm-chip"
            aria-pressed={picked.has(m.id)}
            onClick={() => toggle(m.id)}
          >
            <span className="tcm-check" aria-hidden="true">
              ✓
            </span>
            <span className={`tcm-badge tcm-badge--${m.gender}`} style={{ width: 26, height: 26, fontSize: 12 }}>
              {genderLabel(m.gender)}
            </span>
            {m.name}
            {m.guest && <span className="tcm-g">G</span>}
          </button>
        ))}
      </div>

      {total >= 4 && (
        <div className="tcm-tools">
          <span className="tcm-spacer" />
          <button type="button" className="tcm-btn tcm-btn--primary" onClick={() => go('schedule')}>
            자동 대진 만들러 가기
          </button>
        </div>
      )}
    </>
  );
}
