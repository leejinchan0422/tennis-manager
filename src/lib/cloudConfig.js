/**
 * cloudConfig.js — 서버(Supabase) 연결 정보
 *
 * ★ 여기 들어 있는 키는 '공개용(publishable)' 키입니다.
 *   회원 휴대폰의 브라우저가 대진표를 읽으려면 그 브라우저가 이 키를 가지고 있어야 하므로,
 *   애초에 숨길 수 없도록 설계된 값입니다. Supabase 공식 문서도 클라이언트에 넣도록 안내합니다.
 *
 * ★ 절대 여기에 넣지 않는 것 (PM 결정 ⑧ 보안 원칙)
 *   · service_role / secret 키  → 모든 데이터를 지울 수 있는 마스터 키
 *   · Database Password
 *   이 두 가지는 코드·저장소 어디에도 존재하지 않습니다.
 *
 * 실제 데이터 보호는 이 키가 아니라 서버의 접근 규칙(RLS)과
 * '내부정보는 서버에 올리지 않는다'는 설계로 합니다. (cloud.js 참고)
 */

export const CLOUD = {
  url: 'https://wuimzrdoawddhqfjtsyd.supabase.co',
  key: 'sb_publishable_DLo1KQ2xO8xJl_9PnYlmaw_U9pUDQ89',
};

export const cloudReady = () => !!CLOUD.url && !!CLOUD.key;
