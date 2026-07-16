/**
 * pwa.js — 홈 화면 설치(PWA) 관련
 *
 * 어느 기기에서 열든 같은 웹 주소를 쓰고, 각 기기에서 '홈 화면에 추가'를 하면 앱처럼 씁니다.
 *  · 안드로이드 / 크롬 / 엣지: 설치 버튼이 화면에 자동으로 뜹니다 (beforeinstallprompt)
 *  · 아이폰 / 아이패드 사파리: 브라우저가 설치 버튼을 못 띄우므로 '공유 → 홈 화면에 추가' 안내를 보여줍니다
 */

import { useEffect, useState } from 'react';

let updateCb = null;
let hadController = false;

/**
 * 서비스워커 등록. 개발 중에는 캐시가 방해되므로 배포본(build)에서만 켭니다.
 *
 * BUG-002 대응: 새 버전을 올려도 기기에 저장된 예전 화면이 계속 열리던 문제.
 *  · 30분마다, 그리고 화면을 다시 볼 때마다 새 버전이 있는지 확인합니다.
 *  · 새 버전을 찾으면 화면에 '새 버전이 있습니다' 알림만 띄웁니다.
 *    점수를 입력하는 도중에 화면이 저절로 새로고침되면 안 되므로, 새로고침은 사람이 누를 때만 합니다.
 */
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  hadController = !!navigator.serviceWorker.controller; // 이미 설치돼 있던 상태인지

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000); // 현장 태블릿은 하루 종일 켜져 있으므로 주기 확인
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });
    } catch (err) {
      console.warn('[pwa] 등록 실패', err);
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // 처음 설치되는 순간은 알릴 필요 없음
    if (updateCb) updateCb();
  });
}

/** 새 버전 알림 훅 → { updateReady, reload } */
export function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    updateCb = () => setUpdateReady(true);
    return () => {
      updateCb = null;
    };
  }, []);
  return { updateReady, reload: () => window.location.reload() };
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS
  );
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * 설치 상태 훅.
 * returns { canInstall, install(), showIOSGuide, installed }
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault(); // 브라우저 기본 배너 대신 우리 버튼으로 띄웁니다
      setDeferred(e);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return {
    canInstall: !!deferred && !installed,
    install,
    showIOSGuide: isIOS() && !installed && !deferred,
    installed,
  };
}
