import { QuillDeltaToHtmlConverter } from 'quill-delta-to-html';
import DOMPurify from 'dompurify';

export const AUBL_TABLE_EMBED_KEY = 'aublTable';

const TABLE_MIN_ROWS = 2;
const TABLE_MAX_ROWS = 400;
const TABLE_MIN_COLS = 2;
const TABLE_MAX_COLS = 40;

export interface AublTableData {
  rows: number;
  cols: number;
  cells: string[][];
}

type DeltaOp = {
  insert?: unknown;
  attributes?: Record<string, unknown>;
};

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
    const parsed = JSON.parse(deltaJson) as { ops?: DeltaOp[] };
    if (!Array.isArray(parsed.ops)) return '';
    const raw = convertDeltaOpsToHtml(parsed.ops);
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'span', 'h1', 'h2', 'h3', 'blockquote', 'img', 'iframe', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow', 'loading', 'colspan', 'rowspan'],
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
          if (AUBL_TABLE_EMBED_KEY in op.insert) return '[표]';
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

export function createAublTableData(rows = 3, cols = 3): AublTableData {
  return normalizeAublTableData({ rows, cols });
}

export function resizeAublTableData(table: AublTableData, rows: number, cols: number): AublTableData {
  const safeRows = clampInt(rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const safeCols = clampInt(cols, TABLE_MIN_COLS, TABLE_MAX_COLS);
  const nextCells = Array.from({ length: safeRows }, (_, rowIdx) => (
    Array.from({ length: safeCols }, (_, colIdx) => (
      table.cells[rowIdx]?.[colIdx] ?? defaultTableCell(rowIdx, colIdx)
    ))
  ));
  return { rows: safeRows, cols: safeCols, cells: nextCells };
}

export function normalizeAublTableData(raw: unknown): AublTableData {
  let decoded = raw;
  if (typeof raw === 'string') {
    try {
      decoded = JSON.parse(raw);
    } catch {
      decoded = null;
    }
  }
  const src = (decoded && typeof decoded === 'object' ? decoded : {}) as {
    rows?: unknown;
    cols?: unknown;
    cells?: unknown;
  };
  const rows = clampInt(src.rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS, 3);
  const cols = clampInt(src.cols, TABLE_MIN_COLS, TABLE_MAX_COLS, 3);
  const srcCells = Array.isArray(src.cells) ? src.cells : [];
  const cells = Array.from({ length: rows }, (_, rowIdx) => (
    Array.from({ length: cols }, (_, colIdx) => {
      const row = srcCells[rowIdx];
      if (Array.isArray(row)) {
        const cell = row[colIdx];
        if (typeof cell === 'string') return cell;
        if (cell == null) return defaultTableCell(rowIdx, colIdx);
        return String(cell);
      }
      return defaultTableCell(rowIdx, colIdx);
    })
  ));
  return { rows, cols, cells };
}

export function extractAublTableData(insert: unknown): AublTableData | null {
  if (!insert || typeof insert !== 'object' || Array.isArray(insert)) return null;
  const record = insert as Record<string, unknown>;
  if (!(AUBL_TABLE_EMBED_KEY in record)) return null;
  return normalizeAublTableData(record[AUBL_TABLE_EMBED_KEY]);
}

export function renderAublTableHtml(tableData: AublTableData): string {
  const rowsHtml = tableData.cells.map((row, rowIdx) => (
    `<tr>${row.map((cell) => {
      const tag = rowIdx === 0 ? 'th' : 'td';
      const text = cell.trim() ? escapeHtml(cell) : '&nbsp;';
      return `<${tag}>${text}</${tag}>`;
    }).join('')}</tr>`
  )).join('');
  return `<div class="rt-aubl-table-wrap"><table class="rt-aubl-table"><tbody>${rowsHtml}</tbody></table></div>`;
}

function convertDeltaOpsToHtml(ops: DeltaOp[]): string {
  const chunks: string[] = [];
  let pending: DeltaOp[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    const converter = new QuillDeltaToHtmlConverter(pending as never[], {
      inlineStyles: true,
      linkTarget: '_blank',
      encodeHtml: false,
    });
    chunks.push(converter.convert());
    pending = [];
  };

  for (const op of ops) {
    const tableData = extractAublTableData(op.insert);
    if (tableData) {
      flushPending();
      chunks.push(renderAublTableHtml(tableData));
      continue;
    }
    pending.push(op);
  }
  flushPending();
  return chunks.join('');
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function defaultTableCell(rowIdx: number, colIdx: number): string {
  if (rowIdx === 0) return `항목${colIdx + 1}`;
  return '';
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
