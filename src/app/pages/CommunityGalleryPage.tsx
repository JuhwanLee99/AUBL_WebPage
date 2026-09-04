import { useEffect, useState } from 'react';
import './CommunityPages.css';

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
    <div className="season-content-page community-ui community-gallery-page">
      <section id="aubl-gallery-embed" className="community-gallery-shell">
        <div className="community-gallery-toolbar">
          <div className="community-gallery-heading">
            <p className="community-eyebrow">EMBEDDED VIEW</p>
            <h1>AUBL 갤러리 바로 보기</h1>
          </div>
          <a
            href={GALLERY_URL}
            target="_blank"
            rel="noreferrer"
            className="community-action"
          >
            새 탭으로 이동
          </a>
        </div>

        <div className="community-gallery-frame">
          <iframe
            title="AUBL 갤러리"
            src={GALLERY_URL}
            onLoad={() => setIframeLoaded(true)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
          {!iframeLoaded && !showBlockedNotice && (
            <div
              className="community-gallery-state is-loading"
              role="status"
              aria-live="polite"
            >
              <div className="community-gallery-state__copy">
                <strong>갤러리를 불러오는 중...</strong>
                <span>
                  잠시만 기다려 주세요. 브라우저에서 임베드를 차단하면 아래 안내를 확인하세요.
                </span>
              </div>
            </div>
          )}
          {showBlockedNotice && (
            <div
              className="community-gallery-state is-blocked"
              role="alert"
            >
              <div className="community-gallery-state__copy">
                <strong>임베드가 차단된 것 같아요</strong>
                <span>
                  일부 브라우저나 네트워크에서는 디시인사이드가 새 창에서만 열립니다. 상단의 &quot;새 탭으로 이동&quot; 버튼을 사용해주세요.
                </span>
              </div>
              <a
                href={GALLERY_URL}
                target="_blank"
                rel="noreferrer"
                className="community-action community-action--primary"
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
