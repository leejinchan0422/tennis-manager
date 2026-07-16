/**
 * 자동편성 품질 리포트 (PROJECT_BIBLE §13)
 * 전체 점수 / 경기 수 균형 / 중복 파트너 / 연속 휴식 / 혼복 사용 이유 / 규칙 위반 / 추천 이유
 * 실력 분배는 §13에 따라 제외.
 */
export default function QualityReport({ report, members, config }) {
  if (!report) return null;
  const nameOf = (id) => members.find((m) => m.id === id)?.name || '(삭제됨)';

  return (
    <div className="tcm-card">
      <dl className="tcm-report">
        <div>
          <dt>전체 점수 (내부 평가모델 v1)</dt>
          <dd>
            <b style={{ fontSize: 22 }}>{report.score}</b> / {report.max}점
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              균형 {report.parts.balance} · 파트너 {report.parts.partner} · 휴식 {report.parts.rest} · 규칙{' '}
              {report.parts.rule}
            </div>
          </dd>
        </div>

        <div>
          <dt>경기 수 균형</dt>
          <dd>
            {report.balance.min}~{report.balance.max}게임 (평균 {report.balance.avg})
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {report.balance.spread === 0 ? '전원 동일' : `최대 ${report.balance.spread}게임 차이`}
            </div>
          </dd>
        </div>

        <div>
          <dt>중복 파트너</dt>
          <dd>
            {report.repeatPartners.length === 0
              ? '없음'
              : `${report.repeatPartners.length}조합`}
            {report.repeatPartners.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
                {report.repeatPartners
                  .slice(0, 5)
                  .map(({ k, c }) => `${k.split('|').map(nameOf).join('–')} ${c}회`)
                  .join(', ')}
              </div>
            )}
          </dd>
        </div>

        <div>
          <dt>연속 휴식</dt>
          <dd>
            {report.longRest === 0 ? '3라운드 이상 연속으로 쉬는 사람 없음' : `${report.longRest}명이 3라운드 이상 연속 휴식`}
          </dd>
        </div>

        <div>
          <dt>연속 출전</dt>
          <dd>
            {report.longPlay === 0 ? '4연속 이상 출전 없음' : `${report.longPlay}명이 4연속 이상 출전`}
            {report.consecutiveUnavoidable && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
                참석 인원이 코트를 채우는 인원({config.courts * 4}명) 이하라 전원이 매 게임 뛰어야 합니다.
                수학적으로 피할 수 없으므로 벌점을 주지 않았습니다. (§10-③)
              </div>
            )}
          </dd>
        </div>

        <div>
          <dt>혼복 사용</dt>
          <dd>
            {report.mixedCount === 0 ? '없음' : `${report.mixedCount}경기`}
            {report.mixedReasons.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
                {report.mixedReasons.join(' / ')}
                <br />
                운영상 필요한 혼복이므로 벌점 없음. (§10-②)
              </div>
            )}
          </dd>
        </div>

        <div>
          <dt>규칙 위반</dt>
          <dd style={{ color: report.violations.length ? 'var(--alert)' : 'inherit' }}>
            {report.violations.length === 0 ? '없음' : report.violations.join(' / ')}
          </dd>
        </div>

        <div>
          <dt>실력 분배</dt>
          <dd style={{ color: 'var(--muted)' }}>MVP 제외 (§10-④)</dd>
        </div>
      </dl>
    </div>
  );
}
