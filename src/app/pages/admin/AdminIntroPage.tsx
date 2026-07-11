import { useEffect, useState, type CSSProperties } from 'react';
import { useContent, type ContentState } from '../../../shared/state/contentProvider';

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

const labelStyle: CSSProperties = { color: '#cbd5e1', fontWeight: 800, fontSize: '13px', marginBottom: '6px', display: 'block' };

function serializeHistory(items: ContentState['intro']['historyHighlights']) {
  return items.map((h) => `${h.title} | ${h.desc} | ${h.accent}`).join('\n');
}

function serializeGovernance(items: ContentState['intro']['governance']) {
  return items.map((g) => `${g.label} | ${g.value} | ${g.detail}`).join('\n');
}

function serializeStructure(items: ContentState['intro']['structureCards']) {
  return items.map((s) => `${s.title} | ${s.points.join('; ')}`).join('\n');
}

function serializePostseason(items: ContentState['intro']['postseasonMatches']) {
  return items.map((p) => `${p.title} | ${p.matchups.join('; ')}`).join('\n');
}

function serializeMetrics(items: ContentState['intro']['heroMetrics']) {
  return items.map((m) => `${m.label} | ${m.value} | ${m.note}`).join('\n');
}

export default function AdminIntroPage() {
  const { content, updateContent } = useContent();
  const intro = content.intro;

  const [tagline, setTagline] = useState(intro.tagline);
  const [heroSubtitle, setHeroSubtitle] = useState(intro.heroSubtitle);
  const [heroTitle, setHeroTitle] = useState(intro.heroTitle);
  const [heroDescription, setHeroDescription] = useState(intro.heroDescription);

  const [historyDraft, setHistoryDraft] = useState(serializeHistory(intro.historyHighlights));
  const [governanceDraft, setGovernanceDraft] = useState(serializeGovernance(intro.governance));
  const [structureDraft, setStructureDraft] = useState(serializeStructure(intro.structureCards));
  const [postseasonDraft, setPostseasonDraft] = useState(serializePostseason(intro.postseasonMatches));
  const [metricsDraft, setMetricsDraft] = useState(serializeMetrics(intro.heroMetrics));

  const [status, setStatus] = useState<string | null>(null);
  const [previewIntro, setPreviewIntro] = useState<ContentState['intro'] | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setTagline(intro.tagline);
      setHeroSubtitle(intro.heroSubtitle);
      setHeroTitle(intro.heroTitle);
      setHeroDescription(intro.heroDescription);
      setHistoryDraft(serializeHistory(intro.historyHighlights));
      setGovernanceDraft(serializeGovernance(intro.governance));
      setStructureDraft(serializeStructure(intro.structureCards));
      setPostseasonDraft(serializePostseason(intro.postseasonMatches));
      setMetricsDraft(serializeMetrics(intro.heroMetrics));
    });
  }, [
    intro.tagline,
    intro.heroSubtitle,
    intro.heroTitle,
    intro.heroDescription,
    intro.historyHighlights,
    intro.governance,
    intro.structureCards,
    intro.postseasonMatches,
    intro.heroMetrics,
  ]);

  const parseHistory = () =>
    historyDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, desc, accent] = line.split('|').map((v) => v.trim());
        return { title, desc, accent: accent || '#60a5fa' };
      })
      .filter((item) => item.title && item.desc);

  const parseGovernance = () =>
    governanceDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value, detail] = line.split('|').map((v) => v.trim());
        return { label, value, detail: detail || '' };
      })
      .filter((item) => item.label && item.value);

  const parseStructure = () =>
    structureDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, pointsRaw] = line.split('|').map((v) => v.trim());
        const points = (pointsRaw || '').split(';').map((p) => p.trim()).filter(Boolean);
        return { title, points };
      })
      .filter((item) => item.title);

  const parsePostseason = () =>
    postseasonDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, matchupsRaw] = line.split('|').map((v) => v.trim());
        const matchups = (matchupsRaw || '').split(';').map((p) => p.trim()).filter(Boolean);
        return { title, matchups };
      })
      .filter((item) => item.title);

  const parseMetrics = () =>
    metricsDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value, note] = line.split('|').map((v) => v.trim());
        return { label, value, note: note || '' };
      })
      .filter((item) => item.label && item.value);

  const saveIntro = () => {
    updateContent({
      intro: {
        tagline,
        heroSubtitle,
        heroTitle,
        heroDescription,
        historyHighlights: parseHistory(),
        governance: parseGovernance(),
        structureCards: parseStructure(),
        postseasonMatches: parsePostseason(),
        heroMetrics: parseMetrics(),
      },
    });
    setStatus('리그 소개 콘텐츠를 저장했습니다.');
  };

  const preview = {
    tagline,
    heroSubtitle,
    heroTitle,
    heroDescription,
    historyHighlights: parseHistory(),
    governance: parseGovernance(),
    structureCards: parseStructure(),
    postseasonMatches: parsePostseason(),
    heroMetrics: parseMetrics(),
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {status && <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.45)', color: '#bbf7d0', fontWeight: 800 }}>{status}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>리그 소개 편집</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div><label style={labelStyle}>상단 태그라인</label><input style={inputStyle} value={tagline} onChange={(e) => setTagline(e.target.value)} /></div>
          <div><label style={labelStyle}>상단 서브텍스트</label><input style={inputStyle} value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} /></div>
          <div><label style={labelStyle}>히어로 타이틀</label><textarea style={{ ...inputStyle, minHeight: '70px', fontFamily: 'inherit' }} value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} /></div>
          <div><label style={labelStyle}>히어로 설명</label><textarea style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit' }} value={heroDescription} onChange={(e) => setHeroDescription(e.target.value)} /></div>
          <div><label style={labelStyle}>하이라이트 카드 (제목 | 설명 | 색상)</label><textarea style={{ ...inputStyle, minHeight: '100px', fontFamily: 'inherit' }} value={historyDraft} onChange={(e) => setHistoryDraft(e.target.value)} /></div>
          <div><label style={labelStyle}>거버넌스 (레이블 | 값 | 상세)</label><textarea style={{ ...inputStyle, minHeight: '100px', fontFamily: 'inherit' }} value={governanceDraft} onChange={(e) => setGovernanceDraft(e.target.value)} /></div>
          <div><label style={labelStyle}>구조 카드 (제목 | 포인트1; 포인트2)</label><textarea style={{ ...inputStyle, minHeight: '100px', fontFamily: 'inherit' }} value={structureDraft} onChange={(e) => setStructureDraft(e.target.value)} /></div>
          <div><label style={labelStyle}>포스트시즌 (제목 | 매치업1; 매치업2)</label><textarea style={{ ...inputStyle, minHeight: '100px', fontFamily: 'inherit' }} value={postseasonDraft} onChange={(e) => setPostseasonDraft(e.target.value)} /></div>
          <div><label style={labelStyle}>히어로 메트릭 (레이블 | 값 | 노트)</label><textarea style={{ ...inputStyle, minHeight: '100px', fontFamily: 'inherit' }} value={metricsDraft} onChange={(e) => setMetricsDraft(e.target.value)} /></div>
        </div>

        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setPreviewIntro(preview)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>미리보기</button>
          <button type="button" onClick={saveIntro} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>저장</button>
        </div>
      </section>

      {previewIntro && (
        <section style={cardStyle}>
          <h4 style={{ margin: '0 0 8px', color: '#e2e8f0' }}>미리보기</h4>
          <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 700 }}>{previewIntro.tagline}</p>
          <h4 style={{ margin: '4px 0', color: '#f8fafc' }}>{previewIntro.heroTitle}</h4>
          <p style={{ margin: 0, color: '#94a3b8' }}>{previewIntro.heroDescription}</p>
        </section>
      )}
    </div>
  );
}
