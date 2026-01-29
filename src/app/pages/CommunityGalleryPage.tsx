import { useEffect, useState } from 'react';

const GALLERY_URL = 'https://gall.dcinside.com/mgallery/board/lists/?id=aubl';

export default function CommunityPage() {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  const showBlockedNotice = waited && !iframeLoaded;

  return (
    <div style={{ display: 'grid', gap: '16px', color: '#f8fafc' }}>
      <section
        id="aubl-gallery-embed"
        style={{
          display: 'grid',
          gap: '12px',
          padding: '18px',
          borderRadius: '18px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <p style={{ margin: 0, fontSize: '13px', letterSpacing: '0.05em', fontWeight: 800, color: '#d8e4ff' }}>EMBEDDED VIEW</p>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#f8fafc' }}>AUBL 갤러리 바로 보기</h2>
          </div>
          <a
            href={GALLERY_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '13px',
              backgroundColor: 'rgba(148, 163, 184, 0.12)',
              color: '#e2e8f0',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            새 탭으로 이동
          </a>
        </div>

        <div
          style={{
            position: 'relative',
            borderRadius: '14px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            overflow: 'hidden',
            background: '#ffffff',
            minHeight: '90vh',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <iframe
            title="AUBL 갤러리"
            src={GALLERY_URL}
            style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
            onLoad={() => setIframeLoaded(true)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
          {!iframeLoaded && !showBlockedNotice && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background:
                  'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(10,17,31,0.92) 100%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.08), transparent 40%)',
                color: '#f6f7ff',
                gap: '10px',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'grid', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800 }}>갤러리를 불러오는 중...</span>
                <span style={{ fontSize: '13px', color: '#d9e4ff' }}>
                  잠시만 기다려 주세요. 브라우저에서 임베드를 차단하면 아래 안내를 확인하세요.
                </span>
              </div>
            </div>
          )}
          {showBlockedNotice && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                padding: '28px',
                background:
                  'linear-gradient(135deg, rgba(10,16,28,0.88) 0%, rgba(15,23,42,0.9) 100%), radial-gradient(circle at 20% 20%, rgba(249,115,22,0.1), transparent 40%)',
                color: '#f8fafc',
                textAlign: 'center',
                gap: '10px',
              }}
            >
              <div style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontWeight: 900, fontSize: '16px' }}>임베드가 차단된 것 같아요</span>
                <span style={{ color: '#e6ecf8', fontSize: '13px' }}>
                  일부 브라우저나 네트워크에서는 디시인사이드가 새 창에서만 열립니다. 상단의 &quot;새 탭으로 이동&quot; 버튼을 사용해주세요.
                </span>
              </div>
              <a
                href={GALLERY_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 16px',
                  borderRadius: '12px',
                  backgroundColor: '#f97316',
                  color: '#0f172a',
                  fontWeight: 900,
                  fontSize: '14px',
                  textDecoration: 'none',
                  boxShadow: '0 14px 32px rgba(249, 115, 22, 0.3)',
                }}
              >
                새 탭에서 갤러리 열기
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}