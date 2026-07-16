import { useState } from 'react';
import { CLUB_NAME } from '../../lib/session';
import { checkCode, setUnlocked } from '../../lib/adminAccess';

/**
 * 관리자 화면 접근코드 입력 (PM 결정 ⑥)
 * 현장 공개 화면(#/display)과 회원 조회(#/view)는 이 화면을 절대 거치지 않습니다.
 */
export default function AdminGate({ db, onPass, navigate }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (checkCode(db, code)) {
      setUnlocked(true);
      onPass();
      return;
    }
    setError('접근코드가 맞지 않습니다.');
    setCode('');
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">{CLUB_NAME} 운영진</h1>
          <p className="tcm-sub">관리자 화면입니다. 접근코드를 입력하세요.</p>
        </div>
      </header>

      <div className="tcm-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="tcm-input"
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="접근코드"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button type="button" className="tcm-btn tcm-btn--primary" onClick={submit}>
          들어가기
        </button>
        {error && <p className="tcm-error">{error}</p>}
      </div>

      <p className="tcm-hint">
        점수 입력은 접근코드 없이 할 수 있습니다. 현장 화면으로 가려면 아래 버튼을 누르세요.
      </p>
      <div className="tcm-tools">
        <button type="button" className="tcm-btn" onClick={() => navigate('display')}>
          현장 대시보드
        </button>
        <button type="button" className="tcm-btn" onClick={() => navigate('view')}>
          대진표 보기
        </button>
      </div>
    </>
  );
}
