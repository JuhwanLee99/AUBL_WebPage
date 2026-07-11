import { useEffect, useState, type CSSProperties } from 'react';
import { useContent } from '../../../shared/state/contentProvider';

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

const serialize = {
  valueProps: (items: { title: string; desc: string; icon: string }[]) => items.map((v) => `${v.title} | ${v.desc} | ${v.icon}`).join('\n'),
  snapshotCards: (items: { label: string; value: string; desc: string }[]) => items.map((v) => `${v.label} | ${v.value} | ${v.desc}`).join('\n'),
  seasonHighlights: (items: { title: string; desc: string; icon: string; link: string }[]) => items.map((v) => `${v.title} | ${v.desc} | ${v.icon} | ${v.link}`).join('\n'),
};

export default function AdminLandingPage() {
  const { updateContent, content } = useContent();
  const landing = content.landing;

  const [status, setStatus] = useState<string | null>(null);

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
