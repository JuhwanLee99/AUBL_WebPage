import { useEffect, useMemo, useRef, useState } from 'react';
import { useContent, type ContentState } from '../../shared/state/contentProvider';
import './AdminPage.css';

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
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      previewRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
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
    <div className="admin-content-page">
      <header className="admin-content-page__header">
        <p className="admin-content-page__eyebrow">ADMIN CONTENT</p>
        <h1>콘텐츠 관리</h1>
        <p>{infoText}</p>
      </header>

      {status && (
        <div className="admin-content-page__status" role="status" aria-live="polite">
          {status}
        </div>
      )}

      <section className="admin-content-card">
        <header className="admin-content-card__header">
          <div>
            <p className="admin-content-card__eyebrow">LEAGUE INTRO</p>
            <h2>리그 소개 문구</h2>
          </div>
          <div className="admin-content-card__actions">
            <button type="button" className="admin-content-action admin-content-action--secondary" onClick={previewIntroContent}>
              미리보기
            </button>
            <button type="button" className="admin-content-action admin-content-action--primary" onClick={saveIntro}>
              저장
            </button>
          </div>
        </header>

        <div className="admin-content-fields">
          <label className="admin-content-field" htmlFor="tagline-input">
            <span>상단 태그라인</span>
            <input id="tagline-input" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </label>
          <label className="admin-content-field" htmlFor="subtitle-input">
            <span>상단 서브텍스트</span>
            <input id="subtitle-input" value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} />
          </label>
          <label className="admin-content-field" htmlFor="title-input">
            <span>히어로 타이틀</span>
            <input id="title-input" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} />
          </label>
          <label className="admin-content-field" htmlFor="desc-input">
            <span>히어로 설명</span>
            <textarea
              id="desc-input"
              className="admin-content-field__textarea admin-content-field__textarea--short"
              value={heroDescription}
              onChange={(e) => setHeroDescription(e.target.value)}
            />
          </label>

          <label className="admin-content-field" htmlFor="history-input">
            <span>하이라이트 카드 (제목 | 설명 | 색상)</span>
            <textarea
              id="history-input"
              className="admin-content-field__textarea"
              value={historyDraft}
              onChange={(e) => setHistoryDraft(e.target.value)}
            />
          </label>
          <label className="admin-content-field" htmlFor="gov-input">
            <span>거버넌스 (레이블 | 값 | 상세)</span>
            <textarea
              id="gov-input"
              className="admin-content-field__textarea"
              value={governanceDraft}
              onChange={(e) => setGovernanceDraft(e.target.value)}
            />
          </label>
          <label className="admin-content-field" htmlFor="structure-input">
            <span>구조 카드 (제목 | 포인트1; 포인트2; ...)</span>
            <textarea
              id="structure-input"
              className="admin-content-field__textarea"
              value={structureDraft}
              onChange={(e) => setStructureDraft(e.target.value)}
            />
          </label>
          <label className="admin-content-field" htmlFor="postseason-input">
            <span>포스트시즌 매치업 (제목 | 매치업1; 매치업2; ...)</span>
            <textarea
              id="postseason-input"
              className="admin-content-field__textarea"
              value={postseasonDraft}
              onChange={(e) => setPostseasonDraft(e.target.value)}
            />
          </label>
          <label className="admin-content-field" htmlFor="metrics-input">
            <span>히어로 메트릭 (레이블 | 값 | 노트)</span>
            <textarea
              id="metrics-input"
              className="admin-content-field__textarea"
              value={metricsDraft}
              onChange={(e) => setMetricsDraft(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="admin-content-card admin-content-card--danger">
        <header className="admin-content-card__header">
          <div>
            <p className="admin-content-card__eyebrow">RESET</p>
            <h2>기본값 복원</h2>
          </div>
          <button type="button" className="admin-content-action admin-content-action--danger" onClick={handleReset}>
            기본값으로 초기화
          </button>
        </header>
        <p className="admin-content-card__description">
          모든 필드를 기본 텍스트로 되돌립니다. 저장된 커스텀 문구가 사라집니다.
        </p>
      </section>

      {previewIntro && (
        <section ref={previewRef} className="admin-content-card admin-content-card--preview" aria-labelledby="admin-preview-title">
          <header className="admin-content-card__header">
            <div>
              <p className="admin-content-card__eyebrow">PREVIEW</p>
              <h2 id="admin-preview-title">리그 소개 미리보기</h2>
            </div>
          </header>
          <div className="admin-content-preview">
            <div className="admin-content-preview__hero">
              <p className="admin-content-preview__eyebrow">{previewIntro.tagline}</p>
              <span>{previewIntro.heroSubtitle}</span>
              <h3>{previewIntro.heroTitle}</h3>
              <p>{previewIntro.heroDescription}</p>
            </div>

            <section className="admin-content-preview__section">
              <h3>히어로 메트릭</h3>
              <div className="admin-content-preview__grid admin-content-preview__grid--metrics">
                {previewIntro.heroMetrics.map((metric, index) => (
                  <article key={`pm-${index}`} className="admin-content-preview__item">
                    <small>{metric.label}</small>
                    <strong>{metric.value}</strong>
                    {metric.note && <p>{metric.note}</p>}
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-content-preview__section">
              <h3>하이라이트</h3>
              <div className="admin-content-preview__grid">
                {previewIntro.historyHighlights.map((highlight, index) => (
                  <article
                    key={`ph-${index}`}
                    className="admin-content-preview__item admin-content-preview__item--accent"
                    style={{ borderLeftColor: highlight.accent || 'var(--season-blue-600)' }}
                  >
                    <strong>{highlight.title}</strong>
                    <p>{highlight.desc}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-content-preview__section">
              <h3>거버넌스</h3>
              <div className="admin-content-preview__grid admin-content-preview__grid--governance">
                {previewIntro.governance.map((item, index) => (
                  <article key={`pg-${index}`} className="admin-content-preview__item">
                    <strong>{item.label}</strong>
                    <p>{item.value}</p>
                    <small>{item.detail}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-content-preview__section">
              <h3>구조 카드</h3>
              <div className="admin-content-preview__grid">
                {previewIntro.structureCards.map((card, index) => (
                  <article key={`ps-${index}`} className="admin-content-preview__item">
                    <strong>{card.title}</strong>
                    <ul>
                      {card.points.map((point, pointIndex) => (
                        <li key={`psp-${index}-${pointIndex}`}>{point}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section className="admin-content-preview__section">
              <h3>포스트시즌</h3>
              <div className="admin-content-preview__grid">
                {previewIntro.postseasonMatches.map((match, index) => (
                  <article key={`ppm-${index}`} className="admin-content-preview__item">
                    <strong>{match.title}</strong>
                    <ul>
                      {match.matchups.map((matchup, matchupIndex) => (
                        <li key={`ppm-${index}-${matchupIndex}`}>{matchup}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}
    </div>
  );
}
