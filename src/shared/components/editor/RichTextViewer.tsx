import DOMPurify from 'dompurify';
import { isJsonDelta, deltaToHtml } from './quillUtils';

// iframe src를 YouTube/Vimeo로만 제한 (모듈 레벨에서 한 번만 등록)
let iframeHookRegistered = false;
if (typeof window !== 'undefined' && !iframeHookRegistered) {
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if ((node as Element).tagName === 'IFRAME' && data.attrName === 'src') {
      const allowed = ['youtube.com/embed/', 'player.vimeo.com/'];
      if (!allowed.some((d) => data.attrValue.includes(d))) data.attrValue = '';
    }
  });
  iframeHookRegistered = true;
}

interface Props {
  content: string;
  style?: React.CSSProperties;
}

const baseStyle: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '15px',
  lineHeight: 1.7,
  wordBreak: 'break-word',
};

export default function RichTextViewer({ content, style }: Props) {
  if (!content) return null;

  if (isJsonDelta(content)) {
    const html = deltaToHtml(content);
    return (
      <>
        <style>{`
          .rt-viewer p { margin: 0 0 0.5em; }
          .rt-viewer ul, .rt-viewer ol { padding-left: 1.5em; margin: 0.5em 0; }
          .rt-viewer li { margin-bottom: 0.2em; }
          .rt-viewer a { color: #60a5fa; text-decoration: underline; }
          .rt-viewer strong { font-weight: 700; }
          .rt-viewer em { font-style: italic; }
          .rt-viewer u { text-decoration: underline; }
          .rt-viewer s { text-decoration: line-through; }
          .rt-viewer h1 { font-size: 1.4em; font-weight: 700; margin: 0.5em 0 0.3em; }
          .rt-viewer h2 { font-size: 1.2em; font-weight: 700; margin: 0.5em 0 0.3em; }
          .rt-viewer blockquote { border-left: 3px solid #475569; padding-left: 1em; color: #94a3b8; margin: 0.5em 0; }
          .rt-viewer img { max-width: 100%; border-radius: 8px; margin: 8px 0; display: block; }
          .rt-viewer iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 8px; margin: 8px 0; display: block; }
          .rt-viewer .rt-aubl-table-wrap { width: 100%; overflow-x: auto; margin: 10px 0; border: 1px solid rgba(148,163,184,0.28); border-radius: 10px; background: rgba(15,23,42,0.4); }
          .rt-viewer .rt-aubl-table { width: max-content; min-width: 100%; border-collapse: collapse; }
          .rt-viewer .rt-aubl-table th,
          .rt-viewer .rt-aubl-table td { border: 1px solid rgba(148,163,184,0.25); padding: 8px 10px; text-align: left; min-width: 120px; }
          .rt-viewer .rt-aubl-table th { background: rgba(30,41,59,0.85); color: #f8fafc; font-weight: 700; }
          .rt-viewer .rt-aubl-table td { background: rgba(15,23,42,0.55); color: #e2e8f0; }
        `}</style>
        <div
          className="rt-viewer"
          style={{ ...baseStyle, ...style }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </>
    );
  }

  // plain text (기존 게시글 하위 호환)
  return (
    <p style={{ ...baseStyle, whiteSpace: 'pre-wrap', margin: 0, ...style }}>
      {content}
    </p>
  );
}
