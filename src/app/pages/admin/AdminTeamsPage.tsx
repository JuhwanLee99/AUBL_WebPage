import { useEffect, useState, type CSSProperties } from 'react';
import { useContent } from '../../../shared/state/contentProvider';
import type { GroupLetter } from '../../../shared/lib/teamGroups';

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

const VALID_GROUPS = new Set<GroupLetter>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

export default function AdminTeamsPage() {
  const { content, updateContent } = useContent();
  const teams = content.teams;

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pageBadge, setPageBadge] = useState(teams.pageBadge);
  const [pageTitle, setPageTitle] = useState(teams.pageTitle);
  const [pageDescription, setPageDescription] = useState(teams.pageDescription);
  const [pageNote, setPageNote] = useState(teams.pageNote);
  const [entriesDraft, setEntriesDraft] = useState(teams.entries.map((entry) => `${entry.name} | ${entry.group}`).join('\n'));

  useEffect(() => {
    const syncDraft = () => {
      setPageBadge(teams.pageBadge);
      setPageTitle(teams.pageTitle);
      setPageDescription(teams.pageDescription);
      setPageNote(teams.pageNote);
      setEntriesDraft(teams.entries.map((entry) => `${entry.name} | ${entry.group}`).join('\n'));
    };
    queueMicrotask(syncDraft);
  }, [teams]);

  const saveTeams = () => {
    setError(null);

    const entries = entriesDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [nameRaw, groupRaw] = line.split('|').map((v) => v.trim());
        return { name: nameRaw, group: groupRaw as GroupLetter };
      });

    if (entries.some((entry) => !entry.name)) {
      setError('팀명은 비어 있을 수 없습니다.');
      return;
    }
    if (entries.some((entry) => !VALID_GROUPS.has(entry.group))) {
      setError('조 문자는 A~H만 허용됩니다.');
      return;
    }
    const uniqueNames = new Set(entries.map((entry) => entry.name));
    if (uniqueNames.size !== entries.length) {
      setError('중복 팀명이 있습니다. 팀명을 고유하게 입력해주세요.');
      return;
    }

    updateContent({
      teams: {
        pageBadge,
        pageTitle,
        pageDescription,
        pageNote,
        entries,
      },
    });
    setStatus('참가팀·조편성을 저장했습니다.');
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {status && <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.45)', color: '#bbf7d0', fontWeight: 800 }}>{status}</div>}
      {error && <div style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca', fontWeight: 800 }}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>참가팀 · 조편성 편집</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div><label style={labelStyle}>페이지 배지</label><input style={inputStyle} value={pageBadge} onChange={(e) => setPageBadge(e.target.value)} /></div>
          <div><label style={labelStyle}>페이지 제목</label><input style={inputStyle} value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} /></div>
          <div><label style={labelStyle}>페이지 설명</label><textarea style={{ ...inputStyle, minHeight: '80px', fontFamily: 'inherit' }} value={pageDescription} onChange={(e) => setPageDescription(e.target.value)} /></div>
          <div><label style={labelStyle}>안내문</label><textarea style={{ ...inputStyle, minHeight: '70px', fontFamily: 'inherit' }} value={pageNote} onChange={(e) => setPageNote(e.target.value)} /></div>
          <div>
            <label style={labelStyle}>팀 목록 (팀명 | 조)</label>
            <textarea style={{ ...inputStyle, minHeight: '280px', fontFamily: 'inherit' }} value={entriesDraft} onChange={(e) => setEntriesDraft(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <button type="button" onClick={saveTeams} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>
            팀/조편성 저장
          </button>
        </div>
      </section>
    </div>
  );
}
