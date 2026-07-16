import { useState } from 'react';
import { publishDirty, isPublished, isLive } from './lib/session';
import { useInstallPrompt } from './lib/pwa';
import DashboardPage from './features/dashboard/DashboardPage';
import MembersPage from './features/members/MembersPage';
import AttendancePage from './features/attendance/AttendancePage';
import SchedulePage from './features/schedule/SchedulePage';
import MatchBoardPage from './features/schedule/MatchBoardPage';
import RankingPage from './features/ranking/RankingPage';
import GuestsPage from './features/guests/GuestsPage';
import RlsCheck from './features/admin/RlsCheck';
import { currentUser } from './lib/auth';

/**
 * 운영진 관리 화면 — REQ-ADMIN-001 A
 * 회원·참석·자동대진·후보안·품질리포트·대진수정·랭킹·백업 등 내부 기능은 전부 여기에만 있습니다.
 * 현장 공개 화면(DisplayPage)에는 이 메뉴가 하나도 나오지 않습니다.
 */
const LOCKED = ['members', 'attendance', 'guests', 'schedule'];

const TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'members', label: '회원관리' },
  { id: 'attendance', label: '참석관리' },
  { id: 'guests', label: '게스트' },
  { id: 'schedule', label: '자동 대진' },
  { id: 'board', label: '대진표 · 점수' },
  { id: 'ranking', label: '랭킹' },
];

export default function AdminApp(shared) {
  const { session, navigate, saveFailed, lock, signOut, date } = shared;
  const [tab, setTab] = useState('dashboard');
  const [hideInstall, setHideInstall] = useState(false);
  const { canInstall, install, showIOSGuide } = useInstallPrompt();

  const props = { ...shared, go: setTab, lock };
  const dirty = publishDirty(session);

  return (
    <>
      <nav className="tcm-nav" aria-label="화면 이동">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <span className="tcm-spacer" />
        <button type="button" className="tcm-nav-open" onClick={() => navigate('display')}>
          현장 대시보드 열기
        </button>
      </nav>

      <p className="tcm-admin-mark">
        운영진 전용 화면 — 이 화면을 회원에게 보여주지 마세요
        {currentUser() && (
          <>
            {' · '}
            {currentUser().email} 로 로그인됨{' '}
            <button type="button" className="tcm-quiet" onClick={signOut}>
              로그아웃
            </button>
          </>
        )}
      </p>

      {saveFailed && (
        <p className="tcm-hint tcm-hint--alert">
          이 기기에 저장하지 못했습니다. 브라우저의 시크릿/프라이빗 모드를 끄고 다시 열어 주세요.
          지금 화면을 닫으면 방금 입력한 내용이 사라집니다.
        </p>
      )}

      {session.matches.length > 0 && dirty && (
        <p className="tcm-hint tcm-hint--alert">
          {isPublished(session)
            ? '대진을 고쳤습니다. ‘대진표 · 점수’ 화면에서 ‘수정 확정 및 공개 반영’을 눌러야 현장 화면에 반영됩니다.'
            : '아직 현장에 공개되지 않은 대진입니다. ‘대진표 · 점수’ 화면에서 공개하세요.'}
        </p>
      )}

      {!hideInstall && (canInstall || showIOSGuide) && (
        <div className="tcm-install">
          <p>
            {canInstall
              ? '이 기기에 앱처럼 설치해 두면 주소를 칠 필요 없이 바로 열리고, 인터넷이 없어도 동작합니다.'
              : '아이폰 · 아이패드 사파리에서는 아래쪽 공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 쓸 수 있습니다.'}
          </p>
          {canInstall && (
            <button type="button" className="tcm-btn tcm-btn--primary tcm-btn--small" onClick={install}>
              홈 화면에 설치
            </button>
          )}
          <button type="button" className="tcm-btn tcm-btn--small" onClick={() => setHideInstall(true)}>
            닫기
          </button>
        </div>
      )}

      {tab === 'dashboard' && (
        <>
          <DashboardPage {...props} />
          <p className="tcm-section-title">보안 점검</p>
          <RlsCheck date={date} />
        </>
      )}
      {LOCKED.includes(tab) && isLive(session) ? (
        <LockedNotice session={session} go={setTab} />
      ) : (
        <>
          {tab === 'members' && <MembersPage {...props} />}
          {tab === 'attendance' && <AttendancePage {...props} />}
          {tab === 'guests' && <GuestsPage {...props} />}
          {tab === 'schedule' && <SchedulePage {...props} />}
        </>
      )}
      {tab === 'board' && <MatchBoardPage {...props} />}
      {tab === 'ranking' && <RankingPage {...props} />}

      <p className="tcm-foot">
        입력하는 즉시 지금 쓰는 기기에 저장됩니다. 인터넷이 없어도 됩니다.
        <br />
        데이터는 기기마다 따로 저장됩니다. 다른 기기에서 이어서 쓰려면 회원관리 화면의 ‘백업 저장’ →
        새 기기에서 ‘백업 불러오기’를 하세요.
      </p>
    </>
  );
}

/** 운영 중에는 회원·참석·게스트·자동편성을 잠급니다 (PM 결정) */
function LockedNotice({ session, go }) {
  return (
    <>
      <header className="tcm-head">
        <div>
          <h1 className="tcm-title">운영 중 — {session.liveRound || 1}게임 진행 중</h1>
          <p className="tcm-sub">{session.date}</p>
        </div>
      </header>
      <p className="tcm-empty">
        지금은 <b>운영 중</b>이라 이 화면은 잠겨 있습니다.
        <br />
        경기 중에 명단·참석·대진이 실수로 바뀌는 것을 막기 위해서입니다.
        <br />
        <br />
        점수 입력은 그대로 됩니다.
        <br />
        고쳐야 한다면 ‘대진표 · 점수’ 화면에서 <b>운영 종료</b>를 누르세요.
        <br />
        <button type="button" className="tcm-btn tcm-btn--primary" style={{ marginTop: 16 }} onClick={() => go('board')}>
          대진표 · 점수로 가기
        </button>
      </p>
    </>
  );
}
