import { useMemo, useState } from 'react';
import { generateCandidates } from '../../lib/scheduler';
import { publishPayload, lineupOf } from '../../lib/session';
import { allPlayers } from '../../lib/guests';
import QualityReport from './QualityReport';

/** 자동 대진 생성 — 후보안 3개를 만들고 운영자가 고릅니다. (§12) */
export default function SchedulePage({ db, session, updateSession, go }) {
  const [cands, setCands] = useState([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const players = useMemo(
    () =>
      session.attendance
        .map((id) => allPlayers(db).find((m) => m.id === id))
        .filter(Boolean)
        .map((m) => ({ id: m.id, name: m.name, gender: m.gender })),
    [session.attendance, db.members]
  );

  const cfg = session.config;
  const setCfg = (changes) => updateSession({ config: { ...cfg, ...changes } });

  function run() {
    if (session.matches.length > 0) {
      const ok = window.confirm('이미 만들어진 대진과 입력된 점수가 모두 지워집니다.\n다시 편성할까요?');
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    // 화면이 '만드는 중'을 먼저 그리도록 한 박자 넘깁니다
    setTimeout(() => {
      const { candidates, error } = generateCandidates(players, cfg);
      setCands(candidates);
      setSel(0);
      setError(error || (candidates.length === 0 ? '대진을 만들지 못했습니다. 참석 인원을 확인해 주세요.' : ''));
      setBusy(false);
    }, 30);
  }

  /** 확정 = 현장 공개. 이 버튼을 누르기 전에는 현장 화면에 아무것도 안 나옵니다. (REQ-ADMIN-001 D) */
  function confirmPick() {
    const c = cands[sel];
    const matches = c.matches.map((m) => ({ ...m }));
    updateSession({
      matches,
      report: c.report,
      generatedAt: new Date().toISOString(),
      published: { at: new Date().toISOString(), lineup: lineupOf(matches) },
    });
    go('board');
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">자동 대진 생성</h1>
          <p className="tcm-sub">
            {session.date} · 참석 {players.length}명 · 규칙 기반 편성 (AI 사용 안 함)
          </p>
        </div>
      </header>

      <div className="tcm-tools">
        <label className="tcm-hint" style={{ margin: 0 }}>
          코트
          <select
            className="tcm-select"
            style={{ marginLeft: 8 }}
            value={cfg.courts}
            onChange={(e) => setCfg({ courts: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}코트
              </option>
            ))}
          </select>
        </label>
        <label className="tcm-hint" style={{ margin: 0 }}>
          게임 수
          <select
            className="tcm-select"
            style={{ marginLeft: 8 }}
            value={cfg.rounds}
            onChange={(e) => setCfg({ rounds: Number(e.target.value) })}
          >
            {[4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}게임
              </option>
            ))}
          </select>
        </label>
        <span className="tcm-spacer" />
        <button
          type="button"
          className="tcm-btn tcm-btn--primary"
          onClick={run}
          disabled={busy || players.length < 4}
        >
          {busy ? '만드는 중…' : '자동 편성'}
        </button>
      </div>

      {players.length < 4 && (
        <p className="tcm-hint tcm-hint--alert">
          참석자가 4명보다 적습니다. 참석관리에서 먼저 참석자를 체크해 주세요.
        </p>
      )}
      {error && <p className="tcm-hint tcm-hint--alert">{error}</p>}

      {cands.length > 0 && (
        <>
          <p className="tcm-section-title">후보안 {cands.length}개 — 하나를 고르세요</p>
          <div className="tcm-cands">
            {cands.map((c, i) => (
              <button
                key={i}
                type="button"
                className={'tcm-cand' + (sel === i ? ' tcm-cand--chosen' : c.recommended ? ' tcm-cand--best' : '')}
                onClick={() => setSel(i)}
                style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <span className="tcm-tag" style={{ alignSelf: 'flex-start' }}>
                  {c.label}
                  {c.recommended ? ' · 추천' : ''}
                </span>
                <span className="tcm-cand-score">
                  {c.report.score}
                  <small> / {c.report.max}점</small>
                </span>
                <p className="tcm-cand-reason">{c.reason}</p>
                {sel === i && <span className="tcm-tag">선택됨</span>}
              </button>
            ))}
          </div>

          <p className="tcm-hint">
            후보안과 아래 품질 점수는 <b>운영진만 보는 내부 정보</b>입니다. 현장 공개 화면에는 나오지 않습니다.
            <br />
            점수는 <b>개발용 내부 평가모델 Version 1</b>입니다. 공식 점수가 아닙니다. 과거 데이터로 3~5회
            검증한 뒤에 공식 채택 여부를 결정합니다. (§10-①, §10-⑤)
          </p>

          {cands[sel].report.unusedPlayers.length > 0 && (
            <p className="tcm-hint tcm-hint--alert">
              정상적인 남복·여복·혼복 규칙으로 배정할 수 없는 참가자가 있습니다. 운영자가 직접 조정해주세요.
              <br />
              해당 참가자: <b>{cands[sel].report.unusedPlayers.join(', ')}</b> — 프로그램 오류가 아니라
              편성 불가능 상태입니다. (남복 4명 / 여복 4명 / 혼복 남2·여2 규칙으로는 넣을 자리가 없습니다)
            </p>
          )}

          <p className="tcm-section-title">{cands[sel].label} 품질 리포트</p>
          <QualityReport report={cands[sel].report} members={db.members} config={cfg} />

          <div className="tcm-tools">
            <span className="tcm-spacer" />
            <button type="button" className="tcm-btn" onClick={run}>
              다시 만들기
            </button>
            <button type="button" className="tcm-btn tcm-btn--primary" onClick={confirmPick}>
              대진 확정 및 현장 공개
            </button>
          </div>
        </>
      )}

      {cands.length === 0 && session.matches.length > 0 && (
        <p className="tcm-hint">
          이 날짜에는 이미 확정된 대진이 있습니다. ‘대진표 · 점수’ 화면에서 볼 수 있습니다.
        </p>
      )}
    </>
  );
}
