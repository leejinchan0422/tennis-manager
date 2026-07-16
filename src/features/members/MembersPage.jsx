import { useMemo, useRef, useState } from 'react';
import { exportBackup, readBackupFile } from '../../lib/storage';
import {
  GENDERS,
  genderLabel,
  createMember,
  updateMember,
  validateName,
  findSameName,
  normalizeName,
  sortMembers,
  countActive,
  courtHint,
} from '../../lib/members';

export default function MembersPage({ db, setDb }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('M');
  const [error, setError] = useState('');
  const [dupConfirm, setDupConfirm] = useState(false);
  const [query, setQuery] = useState('');
  const [showResting, setShowResting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const nameRef = useRef(null);
  const fileRef = useRef(null);

  const members = db.members;
  const counts = useMemo(() => countActive(members), [members]);
  const sampleCount = useMemo(() => members.filter((m) => m.sample).length, [members]);
  const hint = useMemo(() => courtHint(counts), [counts]);

  const visible = useMemo(() => {
    const q = normalizeName(query);
    return sortMembers(
      members.filter((m) => {
        if (!showResting && m.status !== 'active') return false;
        if (q && !m.name.includes(q)) return false;
        return true;
      })
    );
  }, [members, query, showResting]);

  function handleAdd() {
    const problem = validateName(name);
    if (problem) return setError(problem);
    if (findSameName(members, name).length > 0 && !dupConfirm) {
      setError(`'${normalizeName(name)}' 은(는) 이미 명단에 있습니다. 동명이인이면 '추가'를 한 번 더 누르세요.`);
      setDupConfirm(true);
      return;
    }
    setDb({ ...db, members: [...members, createMember({ name, gender })] });
    setName('');
    setError('');
    setDupConfirm(false);
    nameRef.current?.focus(); // 여러 명 연달아 넣는 경우가 대부분입니다
  }

  const patch = (id, changes) =>
    setDb({ ...db, members: members.map((m) => (m.id === id ? updateMember(m, changes) : m)) });

  function commitEdit() {
    const problem = validateName(editName);
    if (problem) return setError(problem);
    patch(editingId, { name: editName });
    setEditingId(null);
    setError('');
  }

  function removeForever(m) {
    const ok = window.confirm(
      `${m.name} 회원을 명단에서 완전히 지웁니다.\n지난 참석·경기 기록과 연결이 끊어집니다.\n계속할까요?`
    );
    if (ok) setDb({ ...db, members: members.filter((x) => x.id !== m.id) });
  }

  /** 샘플 명단만 골라서 한 번에 지웁니다. 진짜 명단을 넣기 전에 씁니다. */
  function removeSamples() {
    const ok = window.confirm(
      `샘플 회원 ${sampleCount}명을 지웁니다.\n직접 넣으신 회원은 그대로 남습니다.\n계속할까요?`
    );
    if (!ok) return;
    const ids = new Set(members.filter((m) => m.sample).map((m) => m.id));
    setDb({
      ...db,
      members: members.filter((m) => !ids.has(m.id)),
      // 샘플로 만든 참석·대진 기록도 같이 정리합니다 (이름 없는 대진이 남지 않도록)
      sessions: Object.fromEntries(
        Object.entries(db.sessions).map(([d, s2]) => [
          d,
          {
            ...s2,
            attendance: (s2.attendance || []).filter((id) => !ids.has(id)),
            matches: (s2.matches || []).filter(
              (m) => ![...m.teamA, ...m.teamB].some((id) => ids.has(id))
            ),
            published: s2.published
              ? {
                  ...s2.published,
                  lineup: (s2.published.lineup || []).filter(
                    (m) => ![...m.teamA, ...m.teamB].some((id) => ids.has(id))
                  ),
                }
              : null,
          },
        ])
      ),
    });
    setError('');
  }

  /** 명단 전체 삭제. 되돌릴 수 없어 두 번 확인합니다. */
  function removeAll() {
    if (members.length === 0) return;
    if (!window.confirm(`회원 ${members.length}명을 모두 지웁니다.\n지난 참석·대진·점수 기록에서도 이름이 사라집니다.\n계속할까요?`)) return;
    if (!window.confirm('정말 지울까요?\n되돌릴 수 없습니다.\n(먼저 백업 저장을 해두시면 나중에 복구할 수 있습니다)')) return;
    setDb({ ...db, members: [], sessions: {} });
    setError('');
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = await readBackupFile(file);
      const ok = window.confirm(
        `백업 파일에 회원 ${next.members.length}명이 있습니다.\n지금 이 기기에 있는 내용을 지우고 백업으로 바꿉니다.\n계속할까요?`
      );
      if (ok) setDb(next);
    } catch (err) {
      setError(err.message || '백업 파일을 읽지 못했습니다.');
    }
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">회원관리</h1>
          <p className="tcm-sub">이름과 성별만 사용합니다</p>
        </div>
        <div className="tcm-counts">
          <div className="tcm-count">
            <b>{counts.male}</b>
            <span>남</span>
          </div>
          <div className="tcm-count">
            <b>{counts.female}</b>
            <span>여</span>
          </div>
          <div className="tcm-count">
            <b>{counts.total}</b>
            <span>전체</span>
          </div>
        </div>
      </header>

      <p className="tcm-hint">
        지금 명단이면 남복 {hint.maleCourts}코트, 여복 {hint.femaleCourts}코트를 채울 수 있습니다.
        {hint.mixedNeeded && ' 남거나 모자라는 인원은 혼복으로 채우게 됩니다.'}
        {counts.resting > 0 && ` 휴면 ${counts.resting}명은 대진에서 빠집니다.`}
      </p>

      <div className="tcm-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          ref={nameRef}
          className="tcm-input"
          placeholder="회원 이름"
          value={name}
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value);
            setDupConfirm(false);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <div className="tcm-seg" role="group" aria-label="성별">
          {GENDERS.map((g) => (
            <button key={g.code} type="button" aria-pressed={gender === g.code} onClick={() => setGender(g.code)}>
              {g.label}
            </button>
          ))}
        </div>
        <button type="button" className="tcm-btn tcm-btn--primary" onClick={handleAdd}>
          추가
        </button>
        {error && <p className="tcm-error">{error}</p>}
      </div>

      <div className="tcm-tools">
        <input className="tcm-input" placeholder="이름 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="tcm-btn" aria-pressed={showResting} onClick={() => setShowResting((v) => !v)}>
          {showResting ? '휴면 숨기기' : `휴면 보기 (${counts.resting})`}
        </button>
        <span className="tcm-spacer" />
        <button type="button" className="tcm-btn" onClick={() => exportBackup(db)}>
          백업 저장
        </button>
        <button type="button" className="tcm-btn" onClick={() => fileRef.current?.click()}>
          백업 불러오기
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
      </div>

      {sampleCount > 0 && (
        <div className="tcm-publish" style={{ background: '#fdf8e8', borderColor: '#e6d7a8' }}>
          <p>
            지금 명단에 <b>샘플 회원 {sampleCount}명</b>이 섞여 있습니다. 진짜 명단을 넣기 전에 한 번에 지울 수
            있습니다. (직접 넣으신 회원은 그대로 남습니다)
          </p>
          <button type="button" className="tcm-btn" onClick={removeSamples}>
            샘플 {sampleCount}명 지우기
          </button>
        </div>
      )}

      {members.length > 0 && (
        <div className="tcm-tools">
          <span className="tcm-spacer" />
          <button type="button" className="tcm-btn tcm-btn--danger tcm-btn--small" onClick={removeAll}>
            명단 전체 지우기
          </button>
        </div>
      )}

      <ul className="tcm-list">
        {visible.length === 0 && (
          <li className="tcm-empty">
            {members.length === 0
              ? '아직 회원이 없습니다. 위에 이름을 넣고 남 또는 여를 고른 뒤 추가를 누르세요.'
              : '찾는 이름이 명단에 없습니다.'}
          </li>
        )}

        {visible.map((m) => {
          const isEditing = editingId === m.id;
          const twin = findSameName(members, m.name, m.id).length > 0;
          return (
            <li
              key={m.id}
              className={
                'tcm-row' +
                (m.status === 'active' ? '' : ' tcm-row--resting') +
                (isEditing ? ' tcm-row--editing' : '')
              }
            >
              {isEditing ? (
                <>
                  <div className="tcm-seg" role="group" aria-label="성별 고치기">
                    {GENDERS.map((g) => (
                      <button
                        key={g.code}
                        type="button"
                        aria-pressed={m.gender === g.code}
                        onClick={() => patch(m.id, { gender: g.code })}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="tcm-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                  />
                  <div className="tcm-actions">
                    <button
                      type="button"
                      className="tcm-btn tcm-btn--small"
                      onClick={() => {
                        setEditingId(null);
                        setError('');
                      }}
                    >
                      취소
                    </button>
                    <button type="button" className="tcm-btn tcm-btn--primary tcm-btn--small" onClick={commitEdit}>
                      저장
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className={`tcm-badge tcm-badge--${m.gender}`} aria-hidden="true">
                    {genderLabel(m.gender)}
                  </span>
                  <span className="tcm-name">{m.name}</span>
                  {twin && <span className="tcm-tag">동명이인</span>}
                  {m.status !== 'active' && <span className="tcm-tag">휴면</span>}
                  <div className="tcm-actions">
                    <button
                      type="button"
                      className="tcm-btn tcm-btn--small"
                      onClick={() => {
                        setEditingId(m.id);
                        setEditName(m.name);
                      }}
                    >
                      고치기
                    </button>
                    {m.status === 'active' ? (
                      <button
                        type="button"
                        className="tcm-btn tcm-btn--small"
                        onClick={() => patch(m.id, { status: 'resting' })}
                      >
                        휴면
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="tcm-btn tcm-btn--small"
                          onClick={() => patch(m.id, { status: 'active' })}
                        >
                          복귀
                        </button>
                        <button
                          type="button"
                          className="tcm-btn tcm-btn--small tcm-btn--danger"
                          onClick={() => removeForever(m)}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
