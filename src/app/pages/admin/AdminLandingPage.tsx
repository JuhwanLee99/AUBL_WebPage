import { useEffect, useState, type CSSProperties } from 'react';
import { SeasonButton } from '../../../shared/components/season';
import {
  normalizeSiteAnnouncementHref,
  useContent,
  type SiteAnnouncementTone,
} from '../../../shared/state/contentProvider';

const cardStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '16px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'rgba(15,23,42,0.6)',
  color: '#e2e8f0',
  fontSize: '14px',
};

const labelStyle: CSSProperties = {
  color: '#cbd5e1',
  fontWeight: 800,
  fontSize: '13px',
  marginBottom: '6px',
  display: 'block',
};

const announcementInputStyle: CSSProperties = {
  width: '100%',
  minHeight: '44px',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid var(--season-line)',
  borderRadius: '4px',
  background: 'var(--season-surface)',
  color: 'var(--season-ink)',
  font: 'inherit',
};

const createAnnouncementRevision = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `announcement-${Date.now()}`;
};

const serialize = {
  valueProps: (items: { title: string; desc: string; icon: string }[]) => items.map((v) => `${v.title} | ${v.desc} | ${v.icon}`).join('\n'),
  snapshotCards: (items: { label: string; value: string; desc: string }[]) => items.map((v) => `${v.label} | ${v.value} | ${v.desc}`).join('\n'),
  seasonHighlights: (items: { title: string; desc: string; icon: string; link: string }[]) => items.map((v) => `${v.title} | ${v.desc} | ${v.icon} | ${v.link}`).join('\n'),
};

export default function AdminLandingPage() {
  const { updateContent, updateAnnouncement, content } = useContent();
  const landing = content.landing;
  const announcement = content.announcement;

  const [status, setStatus] = useState<string | null>(null);
  const [announcementStatus, setAnnouncementStatus] = useState<string | null>(null);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [announcementTone, setAnnouncementTone] = useState<SiteAnnouncementTone>(announcement.tone);
  const [announcementTitle, setAnnouncementTitle] = useState(announcement.title);
  const [announcementMessage, setAnnouncementMessage] = useState(announcement.message);
  const [announcementLinkLabel, setAnnouncementLinkLabel] = useState(announcement.linkLabel);
  const [announcementLinkHref, setAnnouncementLinkHref] = useState(announcement.linkHref);

  const [heroEyebrow, setHeroEyebrow] = useState(landing.heroEyebrow);
  const [heroBadgeText, setHeroBadgeText] = useState(landing.heroBadgeText);
  const [heroTitle, setHeroTitle] = useState(landing.heroTitle);
  const [heroDescription, setHeroDescription] = useState(landing.heroDescription);
  const [heroSubDescription, setHeroSubDescription] = useState(landing.heroSubDescription);
  const [valuePropsDraft, setValuePropsDraft] = useState(serialize.valueProps(landing.valueProps));
  const [snapshotCardsDraft, setSnapshotCardsDraft] = useState(serialize.snapshotCards(landing.snapshotCards));
  const [seasonHighlightsDraft, setSeasonHighlightsDraft] = useState(serialize.seasonHighlights(landing.seasonHighlights));

  useEffect(() => {
    const syncDraft = () => {
      setHeroEyebrow(landing.heroEyebrow);
      setHeroBadgeText(landing.heroBadgeText);
      setHeroTitle(landing.heroTitle);
      setHeroDescription(landing.heroDescription);
      setHeroSubDescription(landing.heroSubDescription);
      setValuePropsDraft(serialize.valueProps(landing.valueProps));
      setSnapshotCardsDraft(serialize.snapshotCards(landing.snapshotCards));
      setSeasonHighlightsDraft(serialize.seasonHighlights(landing.seasonHighlights));
    };
    queueMicrotask(syncDraft);
  }, [landing]);

  useEffect(() => {
    const syncAnnouncementDraft = () => {
      setAnnouncementTone(announcement.tone);
      setAnnouncementTitle(announcement.title);
      setAnnouncementMessage(announcement.message);
      setAnnouncementLinkLabel(announcement.linkLabel);
      setAnnouncementLinkHref(announcement.linkHref);
    };
    queueMicrotask(syncAnnouncementDraft);
  }, [announcement]);

  const publishAnnouncement = async () => {
    const title = announcementTitle.trim();
    const message = announcementMessage.trim();
    const linkLabel = announcementLinkLabel.trim();
    const rawLinkHref = announcementLinkHref.trim();

    setAnnouncementStatus(null);
    setAnnouncementError(null);

    if (!title || !message) {
      setAnnouncementError('제목과 본문을 모두 입력해 주세요.');
      return;
    }
    if (Boolean(linkLabel) !== Boolean(rawLinkHref)) {
      setAnnouncementError('링크 문구와 링크 주소는 함께 입력하거나 모두 비워 두어야 합니다.');
      return;
    }

    const safeLinkHref = normalizeSiteAnnouncementHref(rawLinkHref);
    if (rawLinkHref && safeLinkHref === null) {
      setAnnouncementError('링크는 /로 시작하는 AUBL 내부 경로 또는 https 주소만 사용할 수 있습니다.');
      return;
    }

    setAnnouncementBusy(true);
    try {
      await updateAnnouncement({
        enabled: true,
        revision: createAnnouncementRevision(),
        tone: announcementTone,
        title,
        message,
        linkLabel,
        linkHref: safeLinkHref ?? '',
        publishedAt: Date.now(),
      });
      setAnnouncementStatus('새 중요공지를 공개했습니다. 이전 공지의 24시간 숨김 설정은 새 공지에 적용되지 않습니다.');
    } catch {
      setAnnouncementError('중요공지를 저장하지 못했습니다. 관리자 권한과 네트워크 상태를 확인해 주세요.');
    } finally {
      setAnnouncementBusy(false);
    }
  };

  const deactivateAnnouncement = async () => {
    setAnnouncementStatus(null);
    setAnnouncementError(null);
    setAnnouncementBusy(true);
    try {
      await updateAnnouncement({ ...announcement, enabled: false });
      setAnnouncementStatus('상단 중요공지를 비활성화했습니다.');
    } catch {
      setAnnouncementError('중요공지를 비활성화하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setAnnouncementBusy(false);
    }
  };

  const saveLanding = () => {
    const valueProps = valuePropsDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, desc, icon] = line.split('|').map((value) => value.trim());
        return { title, desc, icon: icon || '✨' };
      })
      .filter((item) => item.title && item.desc);

    const snapshotCards = snapshotCardsDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value, desc] = line.split('|').map((entry) => entry.trim());
        return { label, value, desc: desc || '' };
      })
      .filter((item) => item.label && item.value);

    const seasonHighlights = seasonHighlightsDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, desc, icon, link] = line.split('|').map((entry) => entry.trim());
        return { title, desc, icon: icon || '📌', link: link || '/intro' };
      })
      .filter((item) => item.title && item.desc && item.link);

    updateContent({
      landing: {
        heroEyebrow,
        heroBadgeText,
        heroTitle,
        heroDescription,
        heroSubDescription,
        valueProps,
        snapshotCards,
        seasonHighlights,
      },
    });
    setStatus('랜딩 정적 콘텐츠를 저장했습니다.');
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {status && (
        <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.45)', color: '#bbf7d0', fontWeight: 800 }}>
          {status}
        </div>
      )}

      <section
        aria-labelledby="admin-announcement-title"
        style={{
          ...cardStyle,
          display: 'grid',
          gap: '18px',
          borderRadius: '4px',
          background: 'var(--season-surface)',
          color: 'var(--season-ink)',
          boxShadow: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '5px', maxWidth: '720px' }}>
            <span style={{ color: 'var(--season-blue-600)', fontSize: '11px', fontWeight: 900, letterSpacing: '0.12em' }}>
              HOME ANNOUNCEMENT
            </span>
            <h2 id="admin-announcement-title" style={{ margin: 0, color: 'var(--season-ink)', fontSize: '22px' }}>상단 중요공지</h2>
            <p style={{ margin: 0, color: 'var(--season-muted)', fontSize: '13px', lineHeight: 1.6 }}>
              활성화하면 홈 상단 메뉴와 캠페인 히어로 사이에 즉시 표시됩니다. 새로 공개할 때마다 새 리비전으로 처리됩니다.
            </p>
          </div>
          <strong style={{ color: announcement.enabled ? 'var(--season-blue-700)' : 'var(--season-muted)', fontSize: '13px' }}>
            현재 {announcement.enabled ? '활성' : '비활성'}
          </strong>
        </div>

        {announcementStatus ? (
          <div role="status" style={{ borderLeft: '4px solid var(--season-blue-600)', padding: '11px 13px', background: 'var(--season-surface-muted)', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 750 }}>
            {announcementStatus}
          </div>
        ) : null}
        {announcementError ? (
          <div role="alert" style={{ borderLeft: '4px solid var(--season-danger)', padding: '11px 13px', background: 'color-mix(in srgb, var(--season-danger) 9%, var(--season-surface))', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 750 }}>
            {announcementError}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '6px', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 800 }}>
            표시 유형
            <select
              value={announcementTone}
              onChange={(event) => setAnnouncementTone(event.target.value as SiteAnnouncementTone)}
              style={announcementInputStyle}
              disabled={announcementBusy}
            >
              <option value="info">주요 안내</option>
              <option value="warning">긴급 안내</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 800 }}>
            제목
            <input
              value={announcementTitle}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
              maxLength={100}
              placeholder="예) 주말 경기 일정 변경 안내"
              style={announcementInputStyle}
              disabled={announcementBusy}
            />
          </label>
        </div>

        <label style={{ display: 'grid', gap: '6px', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 800 }}>
          본문
          <textarea
            value={announcementMessage}
            onChange={(event) => setAnnouncementMessage(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="필요한 날짜, 변경 사유, 확인 사항을 간결히 입력하세요."
            style={{ ...announcementInputStyle, resize: 'vertical', lineHeight: 1.6 }}
            disabled={announcementBusy}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '6px', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 800 }}>
            링크 문구 (선택)
            <input
              value={announcementLinkLabel}
              onChange={(event) => setAnnouncementLinkLabel(event.target.value)}
              maxLength={60}
              placeholder="예) 공지 자세히 보기"
              style={announcementInputStyle}
              disabled={announcementBusy}
            />
          </label>
          <label style={{ display: 'grid', gap: '6px', color: 'var(--season-ink)', fontSize: '13px', fontWeight: 800 }}>
            링크 주소 (선택)
            <input
              value={announcementLinkHref}
              onChange={(event) => setAnnouncementLinkHref(event.target.value)}
              inputMode="url"
              placeholder="/community/notices/... 또는 https://..."
              style={announcementInputStyle}
              disabled={announcementBusy}
            />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--season-muted)', fontSize: '12px', lineHeight: 1.5 }}>
            링크는 AUBL 내부 경로(/...) 또는 보안된 https 주소만 허용됩니다.
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <SeasonButton variant="secondary" onClick={deactivateAnnouncement} disabled={announcementBusy || !announcement.enabled}>
              비활성화
            </SeasonButton>
            <SeasonButton onClick={publishAnnouncement} disabled={announcementBusy}>
              {announcementBusy ? '저장 중…' : '게시 및 활성화'}
            </SeasonButton>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 10px', color: '#e2e8f0' }}>랜딩 정적 콘텐츠</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div>
            <label style={labelStyle}>Eyebrow</label>
            <input style={inputStyle} value={heroEyebrow} onChange={(e) => setHeroEyebrow(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Badge</label>
            <input style={inputStyle} value={heroBadgeText} onChange={(e) => setHeroBadgeText(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>타이틀</label>
            <textarea style={{ ...inputStyle, minHeight: '70px', fontFamily: 'inherit' }} value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>설명</label>
            <textarea style={{ ...inputStyle, minHeight: '70px', fontFamily: 'inherit' }} value={heroDescription} onChange={(e) => setHeroDescription(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>보조 설명</label>
            <textarea style={{ ...inputStyle, minHeight: '70px', fontFamily: 'inherit' }} value={heroSubDescription} onChange={(e) => setHeroSubDescription(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>KEY VALUES (제목 | 설명 | 아이콘)</label>
            <textarea style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit' }} value={valuePropsDraft} onChange={(e) => setValuePropsDraft(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>시즌 스냅샷 (레이블 | 값 | 설명)</label>
            <textarea style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit' }} value={snapshotCardsDraft} onChange={(e) => setSnapshotCardsDraft(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>하이라이트 (제목 | 설명 | 아이콘 | 링크)</label>
            <textarea style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit' }} value={seasonHighlightsDraft} onChange={(e) => setSeasonHighlightsDraft(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: '10px' }}>
          <button type="button" onClick={saveLanding} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>
            랜딩 정적 저장
          </button>
        </div>
      </section>
    </div>
  );
}
