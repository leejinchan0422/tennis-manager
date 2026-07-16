import { useState } from 'react';
import { runRlsTests } from '../../lib/rls';
import { isSignedIn, currentUser } from '../../lib/auth';

/**
 * RLS 자가진단 화면 — PM 완료기준 5개 테스트를 실제 서버 요청으로 확인합니다.
 * 이 결과 캡처가 곧 '서버가 실제로 막는다'는 증거입니다.
 */
export default function RlsCheck({ date }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setRows(await runRlsTests(date));
    } finally {
      setBusy(false);
    }
  }

  const done = rows?.filter((r) => r.pass !== null) || [];
  const passed = done.filter((r) => r.pass).length;

  return (
    <div className="tcm-card">
      <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.7, color: 'var(--muted)' }}>
        <b style={{ color: 'var(--ink)' }}>서버 차단 점검 (RLS)</b>
        <br />
        화면에서 숨기는 것과 서버가 막는 것은 다릅니다. 이 버튼은 <b>실제로 서버에 요청을 보내서</b> 내부정보가
        막히는지 확인합니다. 결과를 캡처해 PM께 제출하세요.
        <br />
        지금 상태: {isSignedIn() ? `로그인됨 (${currentUser()?.email || ''})` : '로그아웃 상태'}
      </p>
      <button type="button" className="tcm-btn tcm-btn--primary" disabled={busy} onClick={run}>
        {busy ? '점검 중…' : '서버 차단 점검 실행'}
      </button>

      {rows && (
        <>
          <p className="tcm-section-title" style={{ marginTop: 18 }}>
            결과 {passed} / {done.length} 통과
          </p>
          <div className="tcm-scroll">
            <table className="tcm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>테스트</th>
                  <th>기대</th>
                  <th>실제</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.no}>
                    <td>{r.no}</td>
                    <td style={{ textAlign: 'left' }}>{r.name}</td>
                    <td>{r.want}</td>
                    <td style={{ textAlign: 'left' }}>{r.got}</td>
                    <td>
                      <b style={{ color: r.pass === null ? 'var(--muted)' : r.pass ? 'var(--ok)' : 'var(--danger)' }}>
                        {r.pass === null ? '—' : r.pass ? '통과' : '실패'}
                      </b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
