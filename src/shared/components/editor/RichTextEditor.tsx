import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Quill from 'quill';
import { BlockEmbed } from 'quill/blots/block.js';
import {
  AUBL_TABLE_EMBED_KEY,
  createAublTableData,
  isJsonDelta,
  normalizeAublTableData,
  plainTextToDelta,
  resizeAublTableData,
  toGoogleDriveImageUrl,
  toYouTubeEmbedUrl,
  type AublTableData,
} from './quillUtils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  mini?: boolean;
  placeholder?: string;
  minHeight?: number;
  ariaLabel?: string;
}

interface TableDialogState {
  index: number | null;
  data: AublTableData;
}

const FULL_TOOLBAR = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'table', 'image', 'video'],
  ['clean'],
];

const MINI_TOOLBAR = [['bold', 'italic', 'link']];

const wrapStyle: CSSProperties = {
  borderRadius: '4px',
  border: '1px solid var(--season-line-strong)',
  overflow: 'hidden',
  background: 'var(--season-surface)',
};

const editorTheme: CSSProperties = {
  color: 'var(--season-ink)',
  fontSize: '14px',
  lineHeight: 1.6,
};

const tableControlButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 4,
  border: '1px solid var(--season-line-strong)',
  background: 'var(--season-surface)',
  color: 'var(--season-ink)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 750,
};

let tableBlotRegistered = false;

function ensureAublTableBlotRegistered() {
  if (tableBlotRegistered) return;

  class AublTableBlot extends BlockEmbed {
    static blotName = AUBL_TABLE_EMBED_KEY;
    static tagName = 'div';
    static className = 'ql-aubl-table';

    static create(value: unknown) {
      const node = super.create() as HTMLElement;
      const tableData = normalizeAublTableData(value);
      node.setAttribute('contenteditable', 'false');
      node.dataset.table = JSON.stringify(tableData);
      node.innerHTML = buildEditorTablePreviewHtml(tableData);
      return node;
    }

    static value(node: HTMLElement) {
      return normalizeAublTableData(node.dataset.table ?? null);
    }
  }

  Quill.register(AublTableBlot, true);
  tableBlotRegistered = true;
}

export default function RichTextEditor({
  value,
  onChange,
  mini = false,
  placeholder = '내용을 입력하세요',
  minHeight = 200,
  ariaLabel = placeholder,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);

  const lastValueRef = useRef<string>('');

  const [embedDialog, setEmbedDialog] = useState<{ type: 'image' | 'video'; resolve: (url: string | null) => void } | null>(null);
  const [tableDialog, setTableDialog] = useState<TableDialogState | null>(null);
  const embedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const initDelta = useCallback((raw: string) => {
    if (isJsonDelta(raw)) return JSON.parse(raw);
    return JSON.parse(plainTextToDelta(raw));
  }, []);

  useEffect(() => {
    if (!containerRef.current || quillRef.current) return;

    ensureAublTableBlotRegistered();

    const q = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: mini ? MINI_TOOLBAR : FULL_TOOLBAR,
      },
    });
    q.root.setAttribute('aria-label', ariaLabel);

    const tableClickHandler = (event: MouseEvent) => {
      if (mini) return;
      const target = event.target as HTMLElement | null;
      const tableNode = target?.closest('.ql-aubl-table') as HTMLElement | null;
      if (!tableNode) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const finder = Quill as unknown as { find: (domNode: Node) => unknown };
        const blot = finder.find(tableNode);
        if (!blot) return;
        const index = q.getIndex(blot as never);
        const tableData = normalizeAublTableData(tableNode.dataset.table ?? null);
        setTableDialog({ index, data: tableData });
      } catch {
        // no-op
      }
    };

    if (!mini) {
      const toolbar = q.getModule('toolbar') as { addHandler: (name: string, handler: () => void) => void };
      toolbar.addHandler('image', () => {
        new Promise<string | null>((resolve) => setEmbedDialog({ type: 'image', resolve }))
          .then((url) => {
            if (!url) return;
            const imageUrl = toGoogleDriveImageUrl(url);
            const range = q.getSelection(true);
            q.insertEmbed(range.index, 'image', imageUrl, 'user');
            q.setSelection(range.index + 1, 0);
          });
      });
      toolbar.addHandler('video', () => {
        new Promise<string | null>((resolve) => setEmbedDialog({ type: 'video', resolve }))
          .then((url) => {
            if (!url) return;
            const embedUrl = toYouTubeEmbedUrl(url);
            const range = q.getSelection(true);
            q.insertEmbed(range.index, 'video', embedUrl, 'user');
            q.setSelection(range.index + 1, 0);
          });
      });
      toolbar.addHandler('table', () => {
        setTableDialog({ index: null, data: createAublTableData(3, 3) });
      });
      q.root.addEventListener('click', tableClickHandler);
    }

    if (value) {
      q.setContents(initDelta(value));
    }
    lastValueRef.current = value;

    q.on('text-change', () => {
      const delta = JSON.stringify(q.getContents());
      lastValueRef.current = delta;
      onChangeRef.current(delta);
    });

    quillRef.current = q;

    return () => {
      if (!mini) {
        q.root.removeEventListener('click', tableClickHandler);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = quillRef.current;
    if (!q) return;
    if (value === lastValueRef.current) return;
    if (!value) {
      q.setContents([{ insert: '\n' }]);
      lastValueRef.current = '';
    }
  }, [value]);

  useEffect(() => {
    if (embedDialog) setTimeout(() => embedInputRef.current?.focus(), 50);
  }, [embedDialog]);

  const handleEmbedConfirm = () => {
    const url = embedInputRef.current?.value.trim() ?? '';
    embedDialog?.resolve(url || null);
    setEmbedDialog(null);
  };

  const handleEmbedCancel = () => {
    embedDialog?.resolve(null);
    setEmbedDialog(null);
  };

  const adjustTableShape = (nextRows: number, nextCols: number) => {
    setTableDialog((prev) => (
      prev
        ? { ...prev, data: resizeAublTableData(prev.data, nextRows, nextCols) }
        : prev
    ));
  };

  const handleTableCellChange = (rowIdx: number, colIdx: number, text: string) => {
    setTableDialog((prev) => {
      if (!prev) return prev;
      const next = prev.data.cells.map((row, r) => (
        row.map((cell, c) => (r === rowIdx && c === colIdx ? text : cell))
      ));
      return { ...prev, data: { ...prev.data, cells: next } };
    });
  };

  const handleTableConfirm = () => {
    const q = quillRef.current;
    if (!q || !tableDialog) {
      setTableDialog(null);
      return;
    }

    const tableData = normalizeAublTableData(tableDialog.data);
    const targetIndex = tableDialog.index ?? q.getSelection(true).index;

    if (tableDialog.index != null) {
      q.deleteText(targetIndex, 1, 'user');
    }
    q.insertEmbed(targetIndex, AUBL_TABLE_EMBED_KEY, tableData, 'user');

    let cursorIndex = targetIndex + 1;
    if (tableDialog.index == null) {
      const nextChar = q.getText(targetIndex + 1, 1);
      if (nextChar !== '\n') {
        q.insertText(targetIndex + 1, '\n', 'user');
        cursorIndex = targetIndex + 2;
      }
    }
    q.setSelection(cursorIndex, 0, 'silent');
    setTableDialog(null);
  };

  return (
    <>
      <div style={wrapStyle}>
        <style>{`
          .ql-toolbar.ql-snow { border: none; border-bottom: 1px solid var(--season-line); background: var(--season-surface-muted); }
          .ql-container.ql-snow { border: none; }
          .ql-editor { min-height: ${minHeight}px; color: var(--season-ink); font-size: 14px; line-height: 1.6; }
          .ql-editor.ql-blank::before { color: var(--season-muted); opacity: .78; font-style: normal; }
          .ql-snow .ql-stroke { stroke: var(--season-muted); }
          .ql-snow .ql-fill { fill: var(--season-muted); }
          .ql-snow .ql-picker { color: var(--season-muted); }
          .ql-snow .ql-picker-options { background: var(--season-surface); border-color: var(--season-line-strong); color: var(--season-ink); }
          .ql-snow.ql-toolbar button:hover .ql-stroke,
          .ql-snow .ql-toolbar button:hover .ql-stroke { stroke: var(--season-ink); }
          .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: var(--season-blue-600); }
          .ql-snow.ql-toolbar button.ql-active .ql-fill { fill: var(--season-blue-600); }
          .ql-editor a { color: var(--season-blue-700); }
          .ql-editor ul, .ql-editor ol { padding-left: 1.5em; }
          .ql-editor img { max-width: 100%; border-radius: 6px; margin: 4px 0; display: block; }
          .ql-editor iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 6px; margin: 4px 0; }
          .ql-tooltip { background: var(--season-surface); border-color: var(--season-line-strong); color: var(--season-ink); box-shadow: 0 12px 30px color-mix(in srgb, var(--season-navy-950) 14%, transparent); }
          .ql-tooltip input[type=text] { background: var(--season-surface-muted); border-color: var(--season-line-strong); color: var(--season-ink); }
          .ql-snow .ql-toolbar button.ql-table::after,
          .ql-snow.ql-toolbar button.ql-table::after { content: '▦'; font-size: 15px; color: var(--season-muted); line-height: 1; display: block; }
          .ql-snow .ql-toolbar button.ql-table:hover::after,
          .ql-snow.ql-toolbar button.ql-table:hover::after { color: var(--season-ink); }
          .ql-snow .ql-toolbar button.ql-table.ql-active::after,
          .ql-snow.ql-toolbar button.ql-table.ql-active::after { color: var(--season-blue-600); }
          .ql-editor .ql-aubl-table { border: 1px solid var(--season-line-strong); border-radius: 4px; overflow: hidden; background: var(--season-surface); margin: 6px 0; }
          .ql-editor .ql-aubl-table-wrap { overflow-x: auto; }
          .ql-editor .ql-aubl-table-preview { width: max-content; min-width: 100%; border-collapse: collapse; }
          .ql-editor .ql-aubl-table-preview th,
          .ql-editor .ql-aubl-table-preview td { border: 1px solid var(--season-line); min-width: 120px; padding: 7px 10px; text-align: left; }
          .ql-editor .ql-aubl-table-preview th { background: var(--season-navy-900); color: var(--season-surface); }
          .ql-editor .ql-aubl-table-preview td { background: var(--season-surface); color: var(--season-ink); }
          .ql-editor .ql-aubl-table-hint { display: block; padding: 6px 10px; border-top: 1px solid var(--season-line); color: var(--season-muted); font-size: 11px; }
        `}</style>
        <div ref={containerRef} style={editorTheme} />
      </div>

      {embedDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleEmbedCancel(); }}
        >
          <div style={{ background: 'var(--season-surface)', padding: 24, borderRadius: 4, width: 360, border: '1px solid var(--season-line-strong)', color: 'var(--season-ink)' }}>
            <p style={{ color: 'var(--season-ink)', fontWeight: 750, marginBottom: 12 }}>
              {embedDialog.type === 'image' ? '이미지 URL 입력' : '동영상 URL 입력'}
            </p>
            <input
              ref={embedInputRef}
              placeholder={embedDialog.type === 'image' ? 'https://... 또는 Google Drive 공유 링크' : 'https://www.youtube.com/watch?v=...'}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEmbedConfirm(); if (e.key === 'Escape') handleEmbedCancel(); }}
              style={{ width: '100%', minHeight: 44, background: 'var(--season-surface-muted)', border: '1px solid var(--season-line-strong)', borderRadius: 4, padding: '8px 10px', color: 'var(--season-ink)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={handleEmbedCancel} style={tableControlButtonStyle}>취소</button>
              <button onClick={handleEmbedConfirm} style={{ ...tableControlButtonStyle, borderColor: '#397bd3', background: '#174f9d', color: '#fff' }}>삽입</button>
            </div>
          </div>
        </div>
      )}

      {tableDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setTableDialog(null); }}
        >
          <div style={{ background: 'var(--season-surface)', padding: 18, borderRadius: 4, width: 'min(920px, calc(100vw - 24px))', border: '1px solid var(--season-line-strong)', color: 'var(--season-ink)' }}>
            <p style={{ color: 'var(--season-ink)', fontWeight: 750, marginBottom: 12 }}>{tableDialog.index == null ? '표 삽입' : '표 편집'}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button onClick={() => adjustTableShape(tableDialog.data.rows + 1, tableDialog.data.cols)} style={tableControlButtonStyle}>행 +</button>
              <button onClick={() => adjustTableShape(tableDialog.data.rows - 1, tableDialog.data.cols)} style={tableControlButtonStyle}>행 -</button>
              <button onClick={() => adjustTableShape(tableDialog.data.rows, tableDialog.data.cols + 1)} style={tableControlButtonStyle}>열 +</button>
              <button onClick={() => adjustTableShape(tableDialog.data.rows, tableDialog.data.cols - 1)} style={tableControlButtonStyle}>열 -</button>
              <span style={{ color: 'var(--season-muted)', fontSize: 12, marginLeft: 4, alignSelf: 'center' }}>
                {tableDialog.data.rows}행 × {tableDialog.data.cols}열
              </span>
            </div>
            <div style={{ maxHeight: '52vh', overflow: 'auto', border: '1px solid var(--season-line)', borderRadius: 4 }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {tableDialog.data.cells.map((row, rowIdx) => (
                    <tr key={`row-${rowIdx}`}>
                      {row.map((cell, colIdx) => (
                        <td key={`cell-${rowIdx}-${colIdx}`} style={{ border: '1px solid var(--season-line)', background: rowIdx === 0 ? 'var(--season-surface-muted)' : 'var(--season-surface)', minWidth: 130, padding: 0 }}>
                          <input
                            value={cell}
                            onChange={(e) => handleTableCellChange(rowIdx, colIdx, e.target.value)}
                            placeholder={rowIdx === 0 ? `헤더 ${colIdx + 1}` : ''}
                            style={{ width: '100%', minHeight: 44, border: 'none', outline: 'none', padding: '8px 10px', background: 'transparent', color: 'var(--season-ink)', fontSize: 13, boxSizing: 'border-box' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
              <p style={{ margin: 0, color: 'var(--season-muted)', fontSize: 12 }}>표를 클릭하면 언제든 셀 단위로 다시 편집할 수 있습니다.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTableDialog(null)} style={tableControlButtonStyle}>취소</button>
                <button onClick={handleTableConfirm} style={{ ...tableControlButtonStyle, borderColor: '#397bd3', background: '#174f9d', color: '#fff' }}>적용</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildEditorTablePreviewHtml(tableData: AublTableData): string {
  const rows = tableData.cells.map((row, rowIdx) => (
    `<tr>${row.map((cell) => {
      const tag = rowIdx === 0 ? 'th' : 'td';
      const text = cell.trim() ? escapeHtml(cell) : '&nbsp;';
      return `<${tag}>${text}</${tag}>`;
    }).join('')}</tr>`
  )).join('');
  return `<div class="ql-aubl-table-wrap"><table class="ql-aubl-table-preview"><tbody>${rows}</tbody></table></div><span class="ql-aubl-table-hint">표를 클릭해서 셀 단위 편집</span>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
