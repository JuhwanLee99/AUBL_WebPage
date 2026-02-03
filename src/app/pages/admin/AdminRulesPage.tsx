import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useContent, type RuleChapter } from '../../../shared/state/contentProvider';

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

export default function AdminRulesPage() {
  const { content, updateContent } = useContent();
  const rules = content.rules;

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [headerBadge, setHeaderBadge] = useState(rules.headerBadge);
  const [headerTitle, setHeaderTitle] = useState(rules.headerTitle);
  const [headerDescription, setHeaderDescription] = useState(rules.headerDescription);
  const [appendixText, setAppendixText] = useState(rules.appendixText);
  const [hostOrderDraft, setHostOrderDraft] = useState(rules.hostOrder.join('\n'));
  const [chaptersDraft, setChaptersDraft] = useState(JSON.stringify(rules.chapters, null, 2));

  useEffect(() => {
    setHeaderBadge(rules.headerBadge);
    setHeaderTitle(rules.headerTitle);
    setHeaderDescription(rules.headerDescription);
    setAppendixText(rules.appendixText);
    setHostOrderDraft(rules.hostOrder.join('\n'));
    setChaptersDraft(JSON.stringify(rules.chapters, null, 2));
  }, [rules]);

  const parsedHostOrder = useMemo(
    () =>
      hostOrderDraft
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [hostOrderDraft],
  );

  const saveRules = () => {
    setError(null);

    let chapters: RuleChapter[];
    try {
      const parsed = JSON.parse(chaptersDraft) as unknown;
      if (!Array.isArray(parsed)) throw new Error('chapters는 배열이어야 합니다.');
      chapters = parsed as RuleChapter[];
      const valid = chapters.every(
        (chapter) =>
          chapter &&
          typeof chapter.id === 'string' &&
          typeof chapter.title === 'string' &&
          typeof chapter.accent === 'string' &&
          Array.isArray(chapter.articles) &&
          chapter.articles.every((article) => article && typeof article.title === 'string' && Array.isArray(article.body)),
      );
      if (!valid) throw new Error('chapters 구조가 올바르지 않습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'chapters JSON 파싱에 실패했습니다.');
      return;
    }

    updateContent({
      rules: {
        headerBadge,
        headerTitle,
        headerDescription,
        appendixText,
        hostOrder: parsedHostOrder,
        chapters,
      },
    });
    setStatus('회칙 콘텐츠를 저장했습니다.');
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {status && <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.45)', color: '#bbf7d0', fontWeight: 800 }}>{status}</div>}
      {error && <div style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca', fontWeight: 800 }}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>회칙 편집</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div><label style={labelStyle}>헤더 배지</label><input style={inputStyle} value={headerBadge} onChange={(e) => setHeaderBadge(e.target.value)} /></div>
          <div><label style={labelStyle}>헤더 타이틀</label><input style={inputStyle} value={headerTitle} onChange={(e) => setHeaderTitle(e.target.value)} /></div>
          <div><label style={labelStyle}>헤더 설명</label><textarea style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit' }} value={headerDescription} onChange={(e) => setHeaderDescription(e.target.value)} /></div>
          <div><label style={labelStyle}>주최 순서 (줄바꿈)</label><textarea style={{ ...inputStyle, minHeight: '100px', fontFamily: 'inherit' }} value={hostOrderDraft} onChange={(e) => setHostOrderDraft(e.target.value)} /></div>
          <div><label style={labelStyle}>부칙</label><textarea style={{ ...inputStyle, minHeight: '70px', fontFamily: 'inherit' }} value={appendixText} onChange={(e) => setAppendixText(e.target.value)} /></div>
          <div><label style={labelStyle}>chapters JSON</label><textarea style={{ ...inputStyle, minHeight: '240px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} value={chaptersDraft} onChange={(e) => setChaptersDraft(e.target.value)} /></div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <button type="button" onClick={saveRules} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>
            회칙 저장
          </button>
        </div>
      </section>
    </div>
  );
}
