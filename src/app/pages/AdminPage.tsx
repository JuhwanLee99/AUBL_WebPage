import { useEffect, useMemo, useState } from 'react';
import { useContent } from '../../shared/state/contentProvider';

const cardStyle = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '16px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'rgba(15,23,42,0.6)',
  color: '#e2e8f0',
  fontSize: '14px',
};

const labelStyle = { color: '#cbd5e1', fontWeight: 800, fontSize: '13px', marginBottom: '6px', display: 'block' };

function lines(list: string[]) {
  return list.join('\n');
}

export default function AdminPage() {
  const { content, updateContent, resetContent } = useContent();
  const intro = content.intro;

  const [tickerDraft, setTickerDraft] = useState(lines(content.tickerItems));

  const [tagline, setTagline] = useState(intro.tagline);
  const [heroSubtitle, setHeroSubtitle] = useState(intro.heroSubtitle);
  const [heroTitle, setHeroTitle] = useState(intro.heroTitle);
  const [heroDescription, setHeroDescription] = useState(intro.heroDescription);

  const serializeHistory = (items = intro.historyHighlights) =>
    items.map((h) => `${h.title} | ${h.desc} | ${h.accent}`).join('\n');
  const serializeGovernance = (items = intro.governance) =>
    items.map((g) => `${g.label} | ${g.value} | ${g.detail}`).join('\n');
  const serializeStructure = (items = intro.structureCards) =>
    items.map((s) => `${s.title} | ${s.points.join('; ')}`).join('\n');
  const serializePostseason = (items = intro.postseasonMatches) =>
    items.map((p) => `${p.title} | ${p.matchups.join('; ')}`).join('\n');
  const serializeMetrics = (items = intro.heroMetrics) =>
    items.map((m) => `${m.label} | ${m.value} | ${m.note}`).join('\n');

  const [historyDraft, setHistoryDraft] = useState(serializeHistory());
  const [governanceDraft, setGovernanceDraft] = useState(serializeGovernance());
  const [structureDraft, setStructureDraft] = useState(serializeStructure());
  const [postseasonDraft, setPostseasonDraft] = useState(serializePostseason());
  const [metricsDraft, setMetricsDraft] = useState(serializeMetrics());

  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setTickerDraft(lines(content.tickerItems));
    setTagline(intro.tagline);
    setHeroSubtitle(intro.heroSubtitle);
    setHeroTitle(intro.heroTitle);
    setHeroDescription(intro.heroDescription);
    setHistoryDraft(serializeHistory(intro.historyHighlights));
    setGovernanceDraft(serializeGovernance(intro.governance));
    setStructureDraft(serializeStructure(intro.structureCards));
    setPostseasonDraft(serializePostseason(intro.postseasonMatches));
    setMetricsDraft(serializeMetrics(intro.heroMetrics));
  }, [content]);

  const parseTicker = () =>
    tickerDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

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
        const points = (pointsRaw || '')
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean);
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
        const matchups = (matchupsRaw || '')
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean);
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

  const saveTicker = () => {
    updateContent({ tickerItems: parseTicker() });
    setStatus('LIVE INFO 문구를 저장했습니다.');
  };

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
    setStatus('리그 소개 문구를 저장했습니다.');
  };

  const handleReset = () => {
    resetContent();
    setStatus('모든 문구를 기본값으로 복원했습니다.');
  };

  const infoText = useMemo(
    () =>
      [
        '라이브 INFO 문구: 한 줄당 한 항목, 줄바꿈으로 구분',
        '리그 소개 카드: "제목 | 설명 | 포인트" 형태, 포인트는 세미콜론(;)으로 구분',
        '색상(선택): #60a5fa 같은 HEX 값, 비우면 기본 색상 적용',
      ].join(' • '),
    [],
  );

  return (
    <div style={{ display: 'grid', gap: '18px', padding: 'var(--section-padding) 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'rgba(249,115,22,0.12)',
            color: '#f97316',
            fontWeight: 900,
            border: '1px solid rgba(249,115,22,0.4)',
            letterSpacing: '0.04em',
          }}
        >
          ADMIN
        </span>
        <div style={{ display: 'grid', gap: '4px' }}>
          <p style={{ margin: 0, fontWeight: 900, color: '#e2e8f0' }}>콘텐츠 관리</p>
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>{infoText}</p>
        </div>
      </div>

      {status && (
        <div
          role="status"
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(34,197,94,0.35)',
            background: 'rgba(34,197,94,0.12)',
            color: '#bbf7d0',
            fontWeight: 800,
          }}
        >
          {status}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0' }}>랜딩 · LIVE INFO 문구</h3>
          <button
            type='button'
            onClick={saveTicker}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(96,165,250,0.4)',
              background: 'rgba(96,165,250,0.16)',
              color: '#bfdbfe',
              fontWeight: 800,
            }}
          >
            저장
          </button>
        </div>
        <label style={labelStyle} htmlFor="ticker-input">
          한 줄당 하나의 문구 (줄바꿈으로 구분)
        </label>
        <textarea
          id="ticker-input"
          style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit' }}
          value={tickerDraft}
          onChange={(e) => setTickerDraft(e.target.value)}
          placeholder="예) 📢 [공지] ..."
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0' }}>리그 소개 문구</h3>
          <button
            type='button'
            onClick={saveIntro}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(34,197,94,0.4)',
              background: 'rgba(34,197,94,0.14)',
              color: '#bbf7d0',
              fontWeight: 800,
            }}
          >
            저장
          </button>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          <div>
            <label style={labelStyle} htmlFor="tagline-input">
              상단 태그라인
            </label>
            <input id="tagline-input" style={inputStyle} value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="subtitle-input">
              상단 서브텍스트
            </label>
            <input id="subtitle-input" style={inputStyle} value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="title-input">
              히어로 타이틀
            </label>
            <input id="title-input" style={inputStyle} value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="desc-input">
              히어로 설명
            </label>
            <textarea
              id="desc-input"
              style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit' }}
              value={heroDescription}
              onChange={(e) => setHeroDescription(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
          <div>
            <label style={labelStyle} htmlFor="history-input">
              하이라이트 카드 (제목 | 설명 | 색상)
            </label>
            <textarea
              id="history-input"
              style={{ ...inputStyle, minHeight: '110px', fontFamily: 'inherit' }}
              value={historyDraft}
              onChange={(e) => setHistoryDraft(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="gov-input">
              거버넌스 (레이블 | 값 | 상세)
            </label>
            <textarea
              id="gov-input"
              style={{ ...inputStyle, minHeight: '110px', fontFamily: 'inherit' }}
              value={governanceDraft}
              onChange={(e) => setGovernanceDraft(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="structure-input">
              구조 카드 (제목 | 포인트1; 포인트2; ...)
            </label>
            <textarea
              id="structure-input"
              style={{ ...inputStyle, minHeight: '110px', fontFamily: 'inherit' }}
              value={structureDraft}
              onChange={(e) => setStructureDraft(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="postseason-input">
              포스트시즌 매치업 (제목 | 매치업1; 매치업2; ...)
            </label>
            <textarea
              id="postseason-input"
              style={{ ...inputStyle, minHeight: '110px', fontFamily: 'inherit' }}
              value={postseasonDraft}
              onChange={(e) => setPostseasonDraft(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="metrics-input">
              히어로 메트릭 (레이블 | 값 | 노트)
            </label>
            <textarea
              id="metrics-input"
              style={{ ...inputStyle, minHeight: '110px', fontFamily: 'inherit' }}
              value={metricsDraft}
              onChange={(e) => setMetricsDraft(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#e2e8f0' }}>기본값 복원</h3>
          <button
            type='button'
            onClick={handleReset}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(248,113,113,0.4)',
              background: 'rgba(248,113,113,0.14)',
              color: '#fecdd3',
              fontWeight: 800,
            }}
          >
            기본값으로 초기화
          </button>
        </div>
        <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>
          모든 필드를 기본 텍스트로 되돌립니다. 저장된 커스텀 문구가 사라집니다.
        </p>
      </div>
    </div>
  );
}
