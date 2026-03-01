import { QuillDeltaToHtmlConverter } from 'quill-delta-to-html';
import DOMPurify from 'dompurify';

/** Delta JSON string 여부 판별 */
export function isJsonDelta(s: string): boolean {
  if (!s || !s.trim().startsWith('{')) return false;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed?.ops);
  } catch {
    return false;
  }
}

/** Delta JSON → 안전한 HTML 변환 (XSS sanitize 포함) */
export function deltaToHtml(deltaJson: string): string {
  try {
    const { ops } = JSON.parse(deltaJson);
    const converter = new QuillDeltaToHtmlConverter(ops, {
      inlineStyles: true,
      linkTarget: '_blank',
      encodeHtml: false,
    });
    const raw = converter.convert();
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'span', 'h1', 'h2', 'h3', 'blockquote', 'img', 'iframe'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow', 'loading'],
    });
  } catch {
    return '';
  }
}

/** YouTube/외부 동영상 URL → embed URL 변환 */
export function toYouTubeEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

/** Google Drive 공유 링크 → 직접 이미지 URL 변환
 *  drive.google.com/file/d/FILE_ID/... → lh3.googleusercontent.com/d/FILE_ID
 *  drive.google.com/open?id=FILE_ID   → lh3.googleusercontent.com/d/FILE_ID
 */
export function toGoogleDriveImageUrl(url: string): string {
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://lh3.googleusercontent.com/d/${fileMatch[1]}`;
  const openMatch = url.match(/drive\.google\.com\/open\?.*id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return `https://lh3.googleusercontent.com/d/${openMatch[1]}`;
  return url;
}

/** plain text → Delta JSON string 변환 (기존 게시글 에디터 로드 시) */
export function plainTextToDelta(text: string): string {
  const ops = text
    ? [{ insert: text.endsWith('\n') ? text : text + '\n' }]
    : [{ insert: '\n' }];
  return JSON.stringify({ ops });
}

/** Delta JSON → 목록 미리보기용 순수 텍스트 추출
 *  이미지 → [이미지], 동영상 → [동영상] 대체
 */
export function deltaToPreviewText(deltaJson: string): string {
  if (!isJsonDelta(deltaJson)) return deltaJson;
  try {
    const { ops } = JSON.parse(deltaJson) as { ops: { insert?: string | Record<string, unknown> }[] };
    return ops
      .map((op) => {
        if (typeof op.insert === 'string') return op.insert;
        if (op.insert && typeof op.insert === 'object') {
          if ('image' in op.insert) return '[이미지]';
          if ('video' in op.insert) return '[동영상]';
        }
        return '';
      })
      .join('')
      .replace(/\n+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

/** 에디터 value를 실제 텍스트 길이로 계산 (저장 전 empty 체크용) */
export function isDeltaEmpty(deltaJson: string): boolean {
  if (!isJsonDelta(deltaJson)) return !deltaJson.trim();
  try {
    const { ops } = JSON.parse(deltaJson);
    const text: string = ops.map((op: { insert?: string }) => (typeof op.insert === 'string' ? op.insert : '')).join('');
    return text.trim() === '' || text === '\n';
  } catch {
    return true;
  }
}
