import { useCallback, useEffect, useRef, useState } from 'react';
import './ui.css';
import { loadDB, saveDB } from './lib/storage';
import { pushScores, cloudReady, markSynced } from './lib/cloud';
import { getSession, putSession, nextSundayKey } from './lib/session';
import { useAppUpdate } from './lib/pwa';
import { isCodeSet, isUnlocked } from './lib/adminAccess';
import { isSignedIn, ensureToken, signOut } from './lib/auth';
import { cloudReady as hasCloud } from './lib/cloudConfig';
import AdminApp from './AdminApp';
import AdminGate from './features/admin/AdminGate';
import LoginPage from './features/admin/LoginPage';
import SyncBar from './features/cloud/SyncBar';
import DisplayPage from './features/display/DisplayPage';
import ViewPage from './features/view/ViewPage';

/**
 * 주소에 따라 화면을 나눕니다. (REQ-ADMIN-001 E)
 *   view    : 회원 모바일 조회 (읽기 전용) ← 기본 진입 화면 (PM 결정 ⑥)
 *   admin   : 운영진 관리 화면 (접근코드 필요)
 *   display : 현장 공개 대시보드 (코드 없음)
 *
 * 주소는 두 가지 방식을 모두 지원합니다.
 *   1) /admin  /display  /view          ← 서버(Vercel)가 지원하면 이 주소
 *   2) #/admin #/display #/view         ← 어떤 서버에서도 100% 동작 (지금 기본으로 안내하는 주소)
 * 나중에 1번으로 완전히 옮겨도 코드를 고칠 필요가 없습니다.
 */
const ROUTES = ['admin', 'display', 'view'];
export const APP_VERSION = '0.9.0';

function readRoute() {
  const hash = (window.location.hash || '').replace(/^#\/?/, '').split(/[?&/]/)[0];
  const path = (window.location.pathname || '').replace(/^\/+|\/+$/g, '').split('/')[0];
  const raw = (hash || path || '').toLowerCase();
  // 주소를 그냥 열면 회원 조회 화면이 뜹니다. 관리자 화면은 #/admin 으로만 들어갑니다. (PM 결정 ⑥)
  return ROUTES.includes(raw) ? raw : 'view';
}

export default function App() {
  const [db, setDb] = useState(() => loadDB());
  const [route, setRoute] = useState(readRoute);
  const [date, setDate] = useState(() => nextSundayKey());
  const [saveFailed, setSaveFailed] = useState(false);
  const { updateReady, reload } = useAppUpdate();
  const [unlocked, setUnlockedState] = useState(() => isUnlocked());
  const [signedIn, setSignedIn] = useState(() => isSignedIn());

  // 로그인 유지: 출입증이 만료됐으면 조용히 갱신합니다
  useEffect(() => {
    if (!hasCloud()) return;
    ensureToken().then((s) => setSignedIn(!!s));
  }, []);

  useEffect(() => {
    setSaveFailed(!saveDB(db));
  }, [db]);

  // 뒤로가기 / 주소 직접 입력에도 반응
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback((next) => {
    window.location.hash = `#/${next}`;
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);

  const session = getSession(db, date);

  // 점수가 바뀌면 자동으로 서버에 올립니다. (현장에서 누구나 넣은 점수가 다른 기기에 보이게)
  // 2초 모아서 한 번만 보냅니다. 인터넷이 없으면 조용히 넘어가고, 로컬 저장은 그대로 됩니다.
  const scoreTimer = useRef(null);
  const queueScorePush = useCallback((nextDb) => {
    if (!cloudReady()) return;
    clearTimeout(scoreTimer.current);
    scoreTimer.current = setTimeout(() => {
      if (!navigator.onLine) return;
      pushScores(nextDb, date)
        .then(() => markSynced())
        .catch(() => {
          /* 실패해도 화면은 그대로. 다음 동기화 때 다시 올라갑니다 (S2에서 대기열로 보완) */
        });
    }, 2000);
  }, [date]);

  const updateSession = (changes) =>
    setDb((prev) => {
      const next = putSession(prev, { ...getSession(prev, date), ...changes });
      if (changes.matches) queueScorePush(next);
      return next;
    });

  const shared = { db, setDb, date, setDate, session, updateSession, navigate, route, saveFailed };

  return (
    <div className={'tcm-shell' + (route === 'display' ? ' tcm-shell--display' : '')}>
      {updateReady && (
        <div className="tcm-update">
          <p>새 버전이 준비됐습니다. 지금 새로고침하면 최신 화면으로 바뀝니다.</p>
          <button type="button" className="tcm-btn tcm-btn--primary tcm-btn--small" onClick={reload}>
            새로고침
          </button>
        </div>
      )}
      <SyncBar db={db} setDb={setDb} date={date} route={route} version={APP_VERSION} />

      {route === 'display' ? (
        <DisplayPage {...shared} />
      ) : route === 'view' ? (
        <ViewPage {...shared} />
      ) : hasCloud() && !signedIn ? (
        // 운영진 로그인 (PM 결정 (가)) — 서버 데이터 접근권한을 실제로 확인합니다
        <LoginPage navigate={navigate} onPass={() => setSignedIn(true)} />
      ) : isCodeSet(db) && !unlocked ? (
        // 접근코드는 로그인 도입 뒤에는 '화면 잠금'용 보조 장치입니다 (PM 결정 5)
        <AdminGate db={db} navigate={navigate} onPass={() => setUnlockedState(true)} />
      ) : (
        <AdminApp
          {...shared}
          lock={() => setUnlockedState(false)}
          signOut={async () => {
            await signOut();
            setSignedIn(false);
          }}
        />
      )}
    </div>
  );
}
