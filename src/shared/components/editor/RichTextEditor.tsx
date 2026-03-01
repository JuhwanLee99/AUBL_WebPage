import { useEffect, useRef, useCallback, useState, type CSSProperties } from 'react';
import Quill from 'quill';
import { isJsonDelta, plainTextToDelta, toYouTubeEmbedUrl, toGoogleDriveImageUrl } from './quillUtils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  mini?: boolean;
  placeholder?: string;
  minHeight?: number;
}

// 풀 툴바: bold, italic, underline, 목록, 링크, 이미지, 동영상
const FULL_TOOLBAR = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image', 'video'],
  ['clean'],
];

// 미니 툴바: bold, italic, 링크 (댓글용)
const MINI_TOOLBAR = [['bold', 'italic', 'link']];

const wrapStyle: CSSProperties = {
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.3)',
  overflow: 'hidden',
  background: 'rgba(15,23,42,0.6)',
};

const editorTheme: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '14px',
  lineHeight: 1.6,
};

export default function RichTextEditor({ value, onChange, mini = false, placeholder = '내용을 입력하세요', minHeight = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 외부 value → Quill 내부 반영 (초기 로드 및 외부 리셋 시)
  const lastValueRef = useRef<string>('');

  const [embedDialog, setEmbedDialog] = useState<{ type: 'image' | 'video'; resolve: (url: string | null) => void } | null>(null);
  const embedInputRef = useRef<HTMLInputElement>(null);

  const initDelta = useCallback((raw: string) => {
    if (isJsonDelta(raw)) return JSON.parse(raw);
    return JSON.parse(plainTextToDelta(raw));
  }, []);

  useEffect(() => {
    if (!containerRef.current || quillRef.current) return;

    const q = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: mini ? MINI_TOOLBAR : FULL_TOOLBAR,
      },
    });

    // 이미지/동영상 URL 삽입 핸들러 (full 툴바 전용)
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
    }

    // 초기값 설정
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 외부에서 value가 완전히 다르게 바뀔 때(예: 저장 후 초기화) 반영
  useEffect(() => {
    const q = quillRef.current;
    if (!q) return;
    if (value === lastValueRef.current) return;
    // 빈 문자열 = 에디터 초기화
    if (!value) {
      q.setContents([{ insert: '\n' }]);
      lastValueRef.current = '';
    }
  }, [value]);

  // 모달이 열릴 때 input에 포커스
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

  return (
    <>
      <div style={wrapStyle}>
        <style>{`
          .ql-toolbar.ql-snow { border: none; border-bottom: 1px solid rgba(148,163,184,0.2); background: rgba(30,41,59,0.8); }
          .ql-container.ql-snow { border: none; }
          .ql-editor { min-height: ${minHeight}px; color: #e2e8f0; font-size: 14px; line-height: 1.6; }
          .ql-editor.ql-blank::before { color: rgba(148,163,184,0.5); font-style: normal; }
          .ql-snow .ql-stroke { stroke: #94a3b8; }
          .ql-snow .ql-fill { fill: #94a3b8; }
          .ql-snow .ql-picker { color: #94a3b8; }
          .ql-snow .ql-picker-options { background: #1e293b; border-color: rgba(148,163,184,0.3); }
          .ql-snow.ql-toolbar button:hover .ql-stroke,
          .ql-snow .ql-toolbar button:hover .ql-stroke { stroke: #e2e8f0; }
          .ql-snow.ql-toolbar button.ql-active .ql-stroke { stroke: #60a5fa; }
          .ql-snow.ql-toolbar button.ql-active .ql-fill { fill: #60a5fa; }
          .ql-editor a { color: #60a5fa; }
          .ql-editor ul, .ql-editor ol { padding-left: 1.5em; }
          .ql-editor img { max-width: 100%; border-radius: 6px; margin: 4px 0; display: block; }
          .ql-editor iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 6px; margin: 4px 0; }
          .ql-tooltip { background: #1e293b; border-color: rgba(148,163,184,0.3); color: #e2e8f0; }
          .ql-tooltip input[type=text] { background: rgba(15,23,42,0.8); border-color: rgba(148,163,184,0.3); color: #e2e8f0; }
        `}</style>
        <div ref={containerRef} style={editorTheme} />
      </div>

      {embedDialog && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleEmbedCancel(); }}
        >
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 12, width: 360, border: '1px solid rgba(148,163,184,0.2)' }}>
            <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 12 }}>
              {embedDialog.type === 'image' ? '이미지 URL 입력' : '동영상 URL 입력'}
            </p>
            <input
              ref={embedInputRef}
              placeholder={embedDialog.type === 'image' ? 'https://... 또는 Google Drive 공유 링크' : 'https://www.youtube.com/watch?v=...'}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEmbedConfirm(); if (e.key === 'Escape') handleEmbedCancel(); }}
              style={{ width: '100%', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 6, padding: '8px 10px', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={handleEmbedCancel} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(148,163,184,0.3)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>취소</button>
              <button onClick={handleEmbedConfirm} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13 }}>삽입</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
