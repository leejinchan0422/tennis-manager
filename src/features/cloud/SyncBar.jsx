import { useEffect, useState } from 'react';
import { push, pull, cloudReady, markSynced, syncTimeText } from '../../lib/cloud';

/**
 * 동기화 상태 표시 + 수동 동기화 (S1)
 * Product Owner가 성공/실패를 눈으로 판정할 수 있어야 검증이 가능하므로 이 표시를 먼저 만들었습니다.
 *  · admin        : [서버로 보내기] [서버에서 가져오기]
 *  · display/view : 20초마다 자동으로 가져오기 (내부정보는 서버에 없으므로 가져올 수도 없음)
 */
export default function SyncBar({ db, setDb, date, route, version }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [, tick] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => tick((v) => v + 1), 30000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(t);
    };
  }, []);

  async function doPull(silent) {
    if (!cloudReady() || !navigator.onLine) return;
    try {
      setBusy('pull');
      const { db: next, found } = await pull(db, date);
      setDb(next);
      markSynced();
      if (!silent) setMsg(found ? '서버에서 가져왔습니다.' : '서버에 아직 저장된 내용이 없습니다.');
    } catch (e) {
      if (!silent) setMsg(e.message);
    } finally {
      setBusy('');
    }
  }

  async function doPush() {
    try {
      setBusy('push');
      await push(db, date);
      markSynced();
      setMsg('서버로 보냈습니다. 다른 기기에서는 20초 안에 저절로 보입니다.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    if (route === 'admin') return;
    doPull(true);
    const t = setInterval(() => doPull(true), 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, date]);

  if (!cloudReady()) return null;

  return (
    <div className={'tcm-sync' + (online ? '' : ' tcm-sync--off')}>
      <span className="tcm-sync-dot" aria-hidden="true" />
      <span className="tcm-sync-text">
        {online ? '온라인' : '오프라인 — 이 기기에는 그대로 저장됩니다'}
        {' · '}마지막 동기화 {syncTimeText()}
        {' · '}v{version}
      </span>
      <span className="tcm-spacer" />
      {route === 'admin' ? (
        <>
          <button
            type="button"
            className="tcm-btn tcm-btn--small"
            disabled={!online || !!busy}
            onClick={() => doPull(false)}
          >
            {busy === 'pull' ? '가져오는 중…' : '서버에서 가져오기'}
          </button>
          <button
            type="button"
            className="tcm-btn tcm-btn--small tcm-btn--primary"
            disabled={!online || !!busy}
            onClick={doPush}
          >
            {busy === 'push' ? '보내는 중…' : '서버로 보내기'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="tcm-btn tcm-btn--small"
          disabled={!online || !!busy}
          onClick={() => doPull(false)}
        >
          {busy === 'pull' ? '새로고침 중…' : '지금 새로고침'}
        </button>
      )}
      {msg && <p className="tcm-sync-msg">{msg}</p>}
    </div>
  );
}
