import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useContent } from '../../../shared/state/contentProvider';
import type { GroupLetter } from '../../../shared/lib/teamGroups';
import { getTeams, updateTeamActive, type TeamSummary } from '../../../core/api/backendClient';

const cardStyle: CSSProperties = {
  borderRadius: '4px',
  border: '1px solid var(--season-line)',
  background: 'var(--season-surface)',
  padding: '16px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: '44px',
  padding: '10px 12px',
  borderRadius: '2px',
  border: '1px solid var(--season-line-strong)',
  background: 'var(--season-surface)',
  color: 'var(--season-ink)',
  fontSize: '14px',
};

const labelStyle: CSSProperties = { color: 'var(--season-ink)', fontWeight: 800, fontSize: '13px', marginBottom: '6px', display: 'block' };

const VALID_GROUPS = new Set<GroupLetter>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

export default function AdminTeamsPage() {
  const { content, updateContent } = useContent();
  const teams = content.teams;

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendTeams, setBackendTeams] = useState<TeamSummary[]>([]);
  const [backendLoading, setBackendLoading] = useState(false);
  const [activeUpdatingIds, setActiveUpdatingIds] = useState<Set<number>>(new Set());

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

  const loadBackendTeams = useCallback(async () => {
    setBackendLoading(true);
    setBackendError(null);
    try {
      const items = await getTeams();
      setBackendTeams(items);
    } catch (err) {
      setBackendTeams([]);
      setBackendError(err instanceof Error ? err.message : '백엔드 팀 목록을 불러오지 못했습니다.');
    } finally {
      setBackendLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackendTeams();
  }, [loadBackendTeams]);

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

  const toggleTeamActive = async (team: TeamSummary, nextActive: boolean) => {
    setBackendStatus(null);
    setBackendError(null);
    setActiveUpdatingIds((prev) => {
      const next = new Set(prev);
      next.add(team.id);
      return next;
    });
    try {
      await updateTeamActive(team.id, nextActive);
      setBackendTeams((prev) =>
        prev.map((item) => (item.id === team.id ? { ...item, active: nextActive } : item)),
      );
      setBackendStatus(`${team.teamName} 팀을 ${nextActive ? '활성' : '비활성'}으로 변경했습니다.`);
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : '팀 활성/비활성 변경에 실패했습니다.');
    } finally {
      setActiveUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(team.id);
        return next;
      });
    }
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {status && <div style={{ ...cardStyle, borderColor: 'var(--season-success)', color: 'var(--season-success)', fontWeight: 800 }}>{status}</div>}
      {error && <div style={{ ...cardStyle, borderColor: 'var(--season-danger)', color: 'var(--season-danger)', fontWeight: 800 }}>{error}</div>}
      {backendStatus && <div style={{ ...cardStyle, borderColor: 'var(--season-success)', color: 'var(--season-success)', fontWeight: 800 }}>{backendStatus}</div>}
      {backendError && <div style={{ ...cardStyle, borderColor: 'var(--season-danger)', color: 'var(--season-danger)', fontWeight: 800 }}>{backendError}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--season-ink)' }}>참가팀 · 조편성 편집</h3>
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
          <button type="button" onClick={saveTeams} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800, borderColor: 'var(--season-primary-fill)', background: 'var(--season-primary-fill)', color: 'var(--season-on-primary)' }}>
            팀/조편성 저장
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: 'var(--season-ink)' }}>백엔드 팀 활성/비활성 관리</h3>
          <button
            type="button"
            onClick={() => { void loadBackendTeams(); }}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}
            disabled={backendLoading}
          >
            {backendLoading ? '불러오는 중...' : '목록 새로고침'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
          {backendTeams.map((team) => {
            const busy = activeUpdatingIds.has(team.id);
            return (
              <div
                key={team.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '10px',
                  alignItems: 'center',
                  border: '1px solid var(--season-line)',
                  borderRadius: '2px',
                  padding: '10px 12px',
                  background: 'var(--season-surface-muted)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--season-ink)', fontWeight: 800, fontSize: '14px' }}>{team.teamName}</div>
                  <div style={{ color: 'var(--season-muted)', fontSize: '12px' }}>
                    ID: {team.id} · teamCode: {team.teamCode || '-'}
                  </div>
                </div>
                <span
                  style={{
                    color: team.active ? 'var(--season-success)' : 'var(--season-danger)',
                    fontWeight: 800,
                    fontSize: '12px',
                    border: `1px solid ${team.active ? 'var(--season-success)' : 'var(--season-danger)'}`,
                    borderRadius: '2px',
                    padding: '3px 10px',
                  }}
                >
                  {team.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void toggleTeamActive(team, !team.active);
                  }}
                  style={{
                    ...inputStyle,
                    width: 'auto',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    borderColor: team.active ? 'var(--season-danger)' : 'var(--season-success)',
                    color: team.active ? 'var(--season-danger)' : 'var(--season-success)',
                  }}
                >
                  {busy ? '처리 중...' : team.active ? '비활성화' : '활성화'}
                </button>
              </div>
            );
          })}
          {!backendLoading && backendTeams.length === 0 && (
            <div style={{ color: 'var(--season-muted)', fontSize: '13px' }}>백엔드 팀 목록이 비어 있습니다.</div>
          )}
        </div>
      </section>
    </div>
  );
}
