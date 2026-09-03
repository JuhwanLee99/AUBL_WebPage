import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useFeatureFlags } from './FeatureFlagsProvider';

export function AllStarFeatureGate({ children }: { children: ReactElement }) {
  const { allstarEnabled, loading, verifiedByServer } = useFeatureFlags();

  if (loading) {
    return (
      <main
        role="status"
        aria-live="polite"
        style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#071126', color: '#dbeafe' }}
      >
        서비스 상태를 확인하는 중…
      </main>
    );
  }

  if (!verifiedByServer || !allstarEnabled) {
    return (
      <main
        style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px', background: '#071126', color: '#e2e8f0' }}
      >
        <section style={{ width: 'min(100%, 440px)', textAlign: 'center', display: 'grid', gap: '14px' }}>
          <img src="/assets/aubl_clean.png" alt="AUBL" style={{ width: '132px', maxWidth: '42vw', margin: '0 auto' }} />
          <h1 style={{ margin: 0, fontSize: '24px' }}>현재 운영하지 않는 기능입니다</h1>
          <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.65 }}>
            요청한 페이지는 지금 공개되어 있지 않습니다. AUBL 메인 페이지에서 운영 중인 서비스를 이용해 주세요.
          </p>
          <Link
            to="/"
            replace
            style={{ justifySelf: 'center', padding: '11px 18px', borderRadius: '12px', background: '#2563eb', color: '#fff', fontWeight: 900 }}
          >
            AUBL 메인으로
          </Link>
        </section>
      </main>
    );
  }

  return children;
}
