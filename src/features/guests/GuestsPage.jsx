import { useMemo, useRef, useState } from 'react';
import { GENDERS, genderLabel, createMember, sortMembers } from '../../lib/members';
import { createGuest, updateGuest, validateGuestName, timesOf, withTimes } from '../../lib/guests';

/**
 * 게스트 관리 — 관리자 화면에서만 보입니다. (PM 결정 ⑦)
 * 공개 화면에는 이 화면이 없고, 이름 옆에 'G' 표시만 나갑니다.
 */
export default function GuestsPage({ db, setDb, date, session, updateSession }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('M');
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  const guests = useMemo(() => sortMembers((db.guests || []).filter((g) => !g.convertedAt)), [db.guests]);
  const converted = useMemo(() => (db.guests || []).filter((g) => g.convertedAt), [db.guests]);
  const picked = new Set(session.attendance);

  function add() {
    const problem = validateGuestName(name);
    if (problem) return setError(problem);
    const g = createGuest({ name, gender });
    setDb({ ...db, guests: [...(db.guests || []), g] });
    // 게스트는 그 날 오려고 등록하는 것이므로 참석은 기본으로 켭니다
    updateSession({ attendance: [...session.attendance, g.id] });
    setName('');
    setError('');
    nameRef.current?.focus();
  }

  const patch = (id, changes) =>
    setDb({ ...db, guests: db.guests.map((g) => (g.id === id ? updateGuest(g, changes) : g)) });

  const toggleAttend = (id) => {
    const next = new Set(session.attendance);
    next.has(id) ? next.delete(id) : next.add(id);
    updateSession({ attendance: [...next] });
  };

  const setTime = (id, key, value) => updateSession({ times: withTimes(session, id, { [key]: value }) });

  /** 정규회원으로 전환 — 과거 게스트 기록은 합치지 않습니다 (PM 결정: MVP 미확정 사항) */
  function convert(g) {
    const ok = window.confirm(
      `${g.name} 님을 정규회원으로 등록합니다.\n\n· 앞으로의 기록은 정규회원으로 쌓입니다.\n· 게스트로 뛴 지난 기록은 옮기지 않습니다 (지난 대진표에는 그대로 남습니다).\n\n계속할까요?`
    );
    if (!ok) return;
    const m = createMember({ name: g.name, gender: g.gender });
    setDb({
      ...db,
      members: [...db.members, m],
      guests: db.guests.map((x) =>
        x.id === g.id ? updateGuest(x, { convertedAt: new Date().toISOString(), convertedMemberId: m.id }) : x
      ),
    });
    // 오늘 대진에 이미 들어가 있으면 그대로 둡니다 (경기 중에 사람이 바뀌면 안 되므로)
    if (!picked.has(g.id)) {
      updateSession({ attendance: [...session.attendance.filter((id) => id !== g.id), m.id] });
    }
  }

  function remove(g) {
    const used = Object.values(db.sessions).some((s) =>
      (s.matches || []).some((m) => [...m.teamA, ...m.teamB].includes(g.id))
    );
    if (used) {
      return window.alert(
        `${g.name} 님은 이미 대진에 들어간 기록이 있어 지울 수 없습니다.\n지난 대진표에서 이름이 사라지기 때문입니다.\n오늘 참석만 해제해 주세요.`
      );
    }
    if (!window.confirm(`게스트 ${g.name} 님을 지웁니다.\n계속할까요?`)) return;
    setDb({ ...db, guests: db.guests.filter((x) => x.id !== g.id) });
    updateSession({ attendance: session.attendance.filter((id) => id !== g.id) });
  }

  const attending = guests.filter((g) => picked.has(g.id)).length;

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">게스트 관리</h1>
          <p className="tcm-sub">{date} · 오늘만 함께 뛰는 임시 참가자</p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>{attending}</b>
            <span>오늘 참석</span>
          </div>
          <div className="tcm-count">
            <b>{guests.length}</b>
            <span>전체</span>
          </div>
        </div>
      </header>

      <p className="tcm-hint">
        게스트는 <b>회원 명단에 들어가지 않습니다.</b> 자동 대진에는 정상적으로 들어가고, 당일 랭킹에는
        나오지만 <b>누적 랭킹에는 빠집니다.</b> 지각·귀가 시간은 운영진만 봅니다(현장 화면에 안 나옵니다).
      </p>

      <div className="tcm-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          ref={nameRef}
          className="tcm-input"
          placeholder="게스트 이름"
          value={name}
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <div className="tcm-seg" role="group" aria-label="성별">
          {GENDERS.map((g) => (
            <button key={g.code} type="button" aria-pressed={gender === g.code} onClick={() => setGender(g.code)}>
              {g.label}
            </button>
          ))}
        </div>
        <button type="button" className="tcm-btn tcm-btn--primary" onClick={add}>
          게스트 추가
        </button>
        {error && <p className="tcm-error">{error}</p>}
      </div>

      <ul className="tcm-list">
        {guests.length === 0 && (
          <li className="tcm-empty">
            오늘 오는 게스트가 있으면 위에 이름을 넣으세요.
            <br />
            추가하면 오늘 참석에 자동으로 체크됩니다.
          </li>
        )}
        {guests.map((g) => {
          const t = timesOf(session, g.id);
          const here = picked.has(g.id);
          return (
            <li key={g.id} className={'tcm-row' + (here ? '' : ' tcm-row--resting')} style={{ flexWrap: 'wrap' }}>
              <span className={`tcm-badge tcm-badge--${g.gender}`} aria-hidden="true">
                {genderLabel(g.gender)}
              </span>
              <span className="tcm-name">
                {g.name} <span className="tcm-g">G</span>
              </span>

              <button
                type="button"
                className={'tcm-btn tcm-btn--small' + (here ? ' tcm-btn--primary' : '')}
                aria-pressed={here}
                onClick={() => toggleAttend(g.id)}
              >
                {here ? '참석' : '불참'}
              </button>

              <label className="tcm-timelabel">
                지각
                <input
                  className="tcm-select"
                  type="time"
                  value={t.late}
                  onChange={(e) => setTime(g.id, 'late', e.target.value)}
                />
              </label>
              <label className="tcm-timelabel">
                귀가
                <input
                  className="tcm-select"
                  type="time"
                  value={t.leave}
                  onChange={(e) => setTime(g.id, 'leave', e.target.value)}
                />
              </label>

              <div className="tcm-actions">
                <button type="button" className="tcm-btn tcm-btn--small" onClick={() => convert(g)}>
                  정규회원 전환
                </button>
                <button type="button" className="tcm-btn tcm-btn--small tcm-btn--danger" onClick={() => remove(g)}>
                  삭제
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {converted.length > 0 && (
        <>
          <p className="tcm-section-title">정규회원으로 전환된 게스트</p>
          <p className="tcm-hint">
            {converted.map((g) => g.name).join(', ')} — 지난 대진표의 이름을 지키기 위해 기록은 남겨 둡니다.
            앞으로는 회원관리에서 관리하세요.
          </p>
        </>
      )}
    </>
  );
}
