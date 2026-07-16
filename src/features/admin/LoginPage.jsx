import { useState } from 'react';
import { CLUB_NAME } from '../../lib/session';
import { signIn, resetPassword } from '../../lib/auth';

/**
 * 운영진 로그인 (PM 결정 (가))
 * · #/admin 에서만 나타납니다. 현장(#/display)·회원 조회(#/view)·점수 입력은 로그인이 필요 없습니다.
 * · 회원가입 화면은 없습니다. 계정은 Supabase에서 미리 만듭니다.
 */
export default function LoginPage({ onPass, navigate }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  async function submit() {
    if (!email.trim() || !pw) return setError('이메일과 비밀번호를 넣어 주세요.');
    try {
      setBusy(true);
      setError('');
      await signIn(email, pw);
      setPw('');
      onPass();
    } catch (e) {
      setError(e.message);
      setPw('');
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) return setError('먼저 이메일을 넣고 눌러 주세요.');
    try {
      await resetPassword(email);
      setSent('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하세요.');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">{CLUB_NAME} 운영진</h1>
          <p className="tcm-sub">관리자 화면입니다. 운영진 계정으로 로그인하세요.</p>
        </div>
      </header>

      <div className="tcm-card" style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <input
          className="tcm-input"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
        />
        <input
          className="tcm-input"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button type="button" className="tcm-btn tcm-btn--primary" disabled={busy} onClick={submit}>
          {busy ? '확인 중…' : '로그인'}
        </button>
        {error && <p className="tcm-error">{error}</p>}
        {sent && <p className="tcm-hint" style={{ margin: 0 }}>{sent}</p>}
        <button type="button" className="tcm-quiet" style={{ justifySelf: 'start' }} onClick={forgot}>
          비밀번호를 잊으셨나요?
        </button>
      </div>

      <p className="tcm-hint">
        한 번 로그인하면 이 기기에서는 계속 열립니다. 점수 입력과 현장 화면은 로그인 없이 그대로 씁니다.
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
