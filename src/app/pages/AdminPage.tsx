import { useEffect, useMemo, useState } from 'react';
import { useContent, type ContentState } from '../../shared/state/contentProvider';
import { useRef } from 'react';

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

export default function AdminPage() {
  const { content, updateContent, resetContent } = useContent();
  const intro = content.intro;
  const previewRef = useRef<HTMLDivElement>(null);

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

  const previewIntroContent = () => {
    setPreviewIntro({
      tagline,
      heroSubtitle,
      heroTitle,
      heroDescription,
      historyHighlights: parseHistory(),
      governance: parseGovernance(),
      structureCards: parseStructure(),
      postseasonMatches: parsePostseason(),
      heroMetrics: parseMetrics(),
    });
    setStatus('리그 소개 미리보기를 갱신했습니다. 아래에서 확인하세요.');
    queueMicrotask(() => {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleReset = () => {
    resetContent();
    setStatus('모든 문구를 기본값으로 복원했습니다.');
  };

  const infoText = useMemo(
    () =>
      [
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
          <h3 style={{ margin: 0, color: '#e2e8f0' }}>리그 소개 문구</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type='button'
              onClick={previewIntroContent}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(234,179,8,0.5)',
                background: 'rgba(234,179,8,0.18)',
                color: '#fef08a',
                fontWeight: 800,
              }}
            >
              미리보기
            </button>
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

      {previewIntro && (
        <div ref={previewRef} style={{ ...cardStyle, border: '1px solid rgba(34,197,94,0.28)', background: 'rgba(15,23,42,0.72)' }}>
          <h3 style={{ margin: '0 0 10px', color: '#e2e8f0' }}>미리보기</h3>
          <div style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, color: '#bbf7d0', fontWeight: 800, fontSize: '13px' }}>리그 소개 미리보기</p>
              <div style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: '12px', padding: '14px', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 700, letterSpacing: '0.04em', fontSize: '12px' }}>{previewIntro.tagline}</p>
                <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>{previewIntro.heroSubtitle}</span>
                <h4 style={{ margin: '6px 0', color: '#e2e8f0' }}>{previewIntro.heroTitle}</h4>
                <p style={{ margin: 0, color: '#94a3b8' }}>{previewIntro.heroDescription}</p>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <p style={{ margin: '0 0 4px', color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>히어로 메트릭</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {previewIntro.heroMetrics.map((m, idx) => (
                    <div key={`pm-${idx}`} style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: '10px', padding: '8px', background: 'rgba(255,255,255,0.03)' }}>
                      <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>{m.label}</p>
                      <p style={{ margin: '2px 0 0', color: '#e2e8f0', fontWeight: 800 }}>{m.value}</p>
                      {m.note && <p style={{ margin: 0, color: '#cbd5e1', fontSize: '12px' }}>{m.note}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <p style={{ margin: '0 0 4px', color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>하이라이트</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {previewIntro.historyHighlights.map((h, idx) => (
                    <div
                      key={`ph-${idx}`}
                      style={{
                        border: '1px solid rgba(148,163,184,0.25)',
                        borderRadius: '10px',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <p style={{ margin: 0, color: h.accent || '#60a5fa', fontWeight: 800 }}>{h.title}</p>
                      <p style={{ margin: '4px 0 0', color: '#e2e8f0', fontSize: '13px' }}>{h.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <p style={{ margin: '0 0 4px', color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>거버넌스</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  {previewIntro.governance.map((g, idx) => (
                    <div key={`pg-${idx}`} style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                      <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 800 }}>{g.label}</p>
                      <p style={{ margin: '2px 0 0', color: '#cbd5e1', fontSize: '13px' }}>{g.value}</p>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>{g.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <p style={{ margin: '0 0 4px', color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>구조 카드</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {previewIntro.structureCards.map((s, idx) => (
                    <div key={`ps-${idx}`} style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                      <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 800 }}>{s.title}</p>
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5 }}>
                        {s.points.map((p, pi) => (
                          <li key={`psp-${idx}-${pi}`}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <p style={{ margin: '0 0 4px', color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>포스트시즌</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {previewIntro.postseasonMatches.map((m, idx) => (
                    <div key={`ppm-${idx}`} style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                      <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 800 }}>{m.title}</p>
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5 }}>
                        {m.matchups.map((p, pi) => (
                          <li key={`ppm-${idx}-${pi}`}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
