import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useContent } from '@shared/state/contentProvider';
import { DEFAULT_RULE_CHAPTERS, DEFAULT_RULE_HOST_ORDER } from '@shared/content/defaultRules';

/* ─── 회칙 데이터 ─── */

type Article = { title: string; body: string[] };
type Chapter = { id: string; title: string; accent: string; articles: Article[] };

const CHAPTERS: Chapter[] = DEFAULT_RULE_CHAPTERS as Chapter[];
const HOST_ORDER = DEFAULT_RULE_HOST_ORDER;

/* ─── 아코디언 컴포넌트 ─── */

function ChapterAccordion({ chapter, defaultOpen }: { chapter: Chapter; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bodyRef.current) return;
    if (open) {
      gsap.fromTo(bodyRef.current, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.35, ease: 'power2.out' });
    } else {
      gsap.to(bodyRef.current, { height: 0, opacity: 0, duration: 0.25, ease: 'power2.in' });
    }
  }, [open]);

  return (
    <div
      style={{
        borderRadius: '16px',
        border: `1px solid ${open ? chapter.accent + '55' : 'rgba(148,163,184,0.2)'}`,
        background: open ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
        transition: 'border-color 0.3s, background 0.3s',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '18px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e2e8f0',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              backgroundColor: chapter.accent,
              boxShadow: `0 0 0 5px ${chapter.accent}30`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 800, fontSize: 'clamp(15px, 4vw, 17px)' }}>{chapter.title}</span>
        </span>
        <span
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#94a3b8',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>

      <div ref={bodyRef} style={{ height: defaultOpen ? 'auto' : 0, opacity: defaultOpen ? 1 : 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gap: '16px', padding: '0 20px 20px' }}>
          {chapter.articles.map((article) => (
            <div key={article.title} style={{ display: 'grid', gap: '8px' }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: chapter.accent }}>{article.title}</p>
              <div style={{ display: 'grid', gap: '4px' }}>
                {article.body.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      color: '#cbd5e1',
                      lineHeight: 1.7,
                      fontSize: 'clamp(13px, 3.4vw, 14px)',
                      paddingLeft: line.startsWith('•') || line.startsWith('▸') ? '8px' : 0,
                      ...(line === '' ? { height: '8px' } : {}),
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 메인 페이지 ─── */

export default function RulePage() {
  const { content } = useContent();
  const rules = content.rules;
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.rule-chunk');
      if (blocks) {
        gsap.fromTo(blocks, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' });
      }
    });
    return () => ctx.revert();
  }, []);

  const headerBadge = rules.headerBadge || 'AUBL · RULES';
  const headerTitle = rules.headerTitle || '전국대학아마추어야구연합회 회칙';
  const headerDescription =
    rules.headerDescription ||
    '1997년 추계 제정 · 2024년까지 연차별 개정. 모든 AUBL 공식 경기는 본 회칙에 따라 운영되며, 회칙에 규정되지 않은 사항은 KBO 규정집을 적용합니다.';
  const chapters = rules.chapters?.length ? rules.chapters : CHAPTERS;
  const hostOrder = rules.hostOrder?.length ? rules.hostOrder : HOST_ORDER;
  const appendixText =
    rules.appendixText ||
    '본 회칙은 1997년 추계에 제정되었으며, 이후 대표자회의 의결을 거쳐 2024년까지 연차별로 개정되었다. 회칙에 규정되지 않은 사항은 KBO 규정집을 적용한다.';

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      {/* ── 헤더 ── */}
      <section
        className="rule-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: 'clamp(24px, 6vw, 34px)',
          borderRadius: 'var(--surface-radius-lg, 24px)',
          background:
            'radial-gradient(circle at 10% 20%, rgba(249,115,22,0.14), transparent 30%), radial-gradient(circle at 88% 5%, rgba(96,165,250,0.12), transparent 24%), linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: 'rgba(249,115,22,0.16)',
              color: '#fed7aa',
              border: '1px solid rgba(249,115,22,0.35)',
              fontSize: 'clamp(11px, 2.8vw, 12px)',
            }}
          >
            {headerBadge}
          </span>
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px, 5.5vw, 32px)', lineHeight: 1.25, fontWeight: 900 }}>
          {headerTitle}
        </h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '800px', fontSize: 'clamp(14px, 3.6vw, 15px)' }}>
          {headerDescription}
        </p>
        <Link
          to="/intro"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#93c5fd',
            fontWeight: 700,
            fontSize: 'clamp(13px, 3.4vw, 14px)',
          }}
        >
          ← 리그 소개로 돌아가기
        </Link>
      </section>

      {/* ── 장별 아코디언 ── */}
      <section className="rule-chunk" style={{ display: 'grid', gap: '12px' }}>
        {chapters.map((ch) => (
          <ChapterAccordion key={ch.id} chapter={ch} />
        ))}
      </section>

      {/* ── 주최 순서 ── */}
      <section
        className="rule-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249,115,22,0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>주최 순서</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {hostOrder.map((name, i) => (
            <span
              key={`${name}-${i}`}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'rgba(249,115,22,0.08)',
                border: '1px solid rgba(249,115,22,0.2)',
                color: '#e2e8f0',
                fontWeight: 700,
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ color: '#f97316', fontWeight: 800, fontSize: '11px' }}>{i + 1}</span>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── 부칙 ── */}
      <section
        className="rule-chunk"
        style={{
          padding: '20px 24px',
          borderRadius: '14px',
          border: '1px solid rgba(148,163,184,0.15)',
          background: 'rgba(255,255,255,0.02)',
          color: '#94a3b8',
          fontSize: 'clamp(12px, 3vw, 13px)',
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>
          <strong style={{ color: '#cbd5e1' }}>부칙</strong>
          {'\n'}
          {appendixText}
        </p>
      </section>
    </div>
  );
}
