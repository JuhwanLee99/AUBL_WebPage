import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';
import { TEAMS } from '../../shared/lib/mockData';
import { useAdmin } from '../../shared/auth/useAdmin';

const cardStyle: CSSProperties = {
  border: '1px solid rgba(148,163,184,0.25)',
  borderRadius: '14px',
  padding: '14px',
  background: 'rgba(15,23,42,0.65)',
  display: 'grid',
  gap: '10px',
};

const statusBadge = (match: MatchSchedule) => {
  if (match.status === 'inProgress') return { text: '진행 중', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' };
  if (match.status === 'completed') return { text: '종료', color: '#f97316', bg: 'rgba(249,115,22,0.14)' };
  if (match.status === 'canceled') return { text: '취소', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)' };
  return { text: '예정', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' };
};

type PracticePlayerSlot = NonNullable<MatchSchedule['lineups']>['home'][number];

const makePracticeLineup = (): PracticePlayerSlot[] => [
  ...Array.from({ length: 9 }, () => ({ name: '', pos: '', number: '', throws: 'R', bats: 'R' })),
  { name: '', pos: 'P', number: '', throws: 'R', bats: 'R' },
];

function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createInitialPracticeForm() {
  return {
    homeTeamId: '',
    awayTeamId: '',
    homeTeamName: '',
    awayTeamName: '',
    startAtLocal: toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)),
    venue: 'AUBL 연습구장',
    status: 'scheduled' as MatchSchedule['status'],
    notes: '',
  };
}

export default function SchedulePracticePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(createInitialPracticeForm);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  const practiceMatches = useMemo(
    () =>
      state.matches
        .filter((m) => !m.deleted && (m.recordMode ?? 'official') === 'practice')
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [state.matches],
  );

  const canSubmitPracticeMatch = useMemo(() => {
    if (!form.homeTeamName.trim() || !form.awayTeamName.trim()) return false;
    if (!form.startAtLocal) return false;
    if (form.homeTeamName.trim() === form.awayTeamName.trim()) return false;
    return true;
  }, [form]);

  const handleCreatePracticeMatch = (event: FormEvent) => {
    event.preventDefault();
    const homeTeamName = form.homeTeamName.trim();
    const awayTeamName = form.awayTeamName.trim();
    if (!homeTeamName || !awayTeamName) {
      window.alert('홈/어웨이 팀명을 입력해 주세요.');
      return;
    }
    if (homeTeamName === awayTeamName) {
      window.alert('서로 다른 팀을 선택해 주세요.');
      return;
    }
    if (!form.startAtLocal) {
      window.alert('경기 일시를 선택해 주세요.');
      return;
    }
    const parsed = new Date(form.startAtLocal);
    if (Number.isNaN(parsed.getTime())) {
      window.alert('경기 일시 형식이 올바르지 않습니다.');
      return;
    }

    const match: MatchSchedule = {
      id: `practice-${Date.now()}`,
      homeTeamId: form.homeTeamId || undefined,
      awayTeamId: form.awayTeamId || undefined,
      homeTeamName,
      awayTeamName,
      startTime: parsed.toISOString(),
      venue: form.venue.trim() || 'AUBL 연습구장',
      status: form.status,
      recordMode: 'practice',
      notes: form.notes.trim() || undefined,
      lineups: {
        home: makePracticeLineup(),
        away: makePracticeLineup(),
      },
      benches: {
        home: [],
        away: [],
      },
    };

    actions.addMatch(match);
    setForm(createInitialPracticeForm());
    setShowAddForm(false);
  };

  return (
    <div className="schedule-practice-page" style={{ display: 'grid', gap: '18px' }}>
      <style>
        {`
          .schedule-practice-page input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            filter: invert(1);
            opacity: 1;
            cursor: pointer;
          }
        `}
      </style>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>연습경기</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
            공식기록 미반영 경기만 모아봅니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(16,185,129,0.45)',
                background: 'rgba(16,185,129,0.12)',
                color: '#34d399',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {showAddForm ? '추가 폼 닫기' : '연습경기 추가'}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/schedule')}
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.05)',
              color: '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            일정 메인
          </button>
        </div>
      </header>

      {isAdmin && showAddForm && (
        <form
          onSubmit={handleCreatePracticeMatch}
          style={{
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: '14px',
            padding: '14px',
            background: 'rgba(15,23,42,0.72)',
            display: 'grid',
            gap: '10px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
              HOME 팀
              <select
                value={form.homeTeamId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const nextTeam = TEAMS.find((team) => team.id === nextId);
                  setForm((prev) => ({
                    ...prev,
                    homeTeamId: nextId,
                    homeTeamName: nextTeam?.name ?? prev.homeTeamName,
                  }));
                }}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              >
                <option value="">팀 선택 (직접 입력 가능)</option>
                {TEAMS.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                value={form.homeTeamName}
                onChange={(event) => setForm((prev) => ({ ...prev, homeTeamName: event.target.value }))}
                placeholder="HOME 팀명"
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
              AWAY 팀
              <select
                value={form.awayTeamId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const nextTeam = TEAMS.find((team) => team.id === nextId);
                  setForm((prev) => ({
                    ...prev,
                    awayTeamId: nextId,
                    awayTeamName: nextTeam?.name ?? prev.awayTeamName,
                  }));
                }}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              >
                <option value="">팀 선택 (직접 입력 가능)</option>
                {TEAMS.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <input
                value={form.awayTeamName}
                onChange={(event) => setForm((prev) => ({ ...prev, awayTeamName: event.target.value }))}
                placeholder="AWAY 팀명"
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
              경기 일시
              <input
                type="datetime-local"
                value={form.startAtLocal}
                onChange={(event) => setForm((prev) => ({ ...prev, startAtLocal: event.target.value }))}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
              장소
              <input
                value={form.venue}
                onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))}
                placeholder="예: AUBL 연습구장"
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
              상태
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MatchSchedule['status'] }))}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: '8px 10px',
                }}
              >
                <option value="scheduled">예정</option>
                <option value="inProgress">진행 중</option>
                <option value="completed">종료</option>
                <option value="canceled">취소</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
            메모 (선택)
            <input
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="연습경기 비고"
              style={{
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(2,6,23,0.75)',
                color: '#e2e8f0',
                padding: '8px 10px',
              }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={!canSubmitPracticeMatch}
              style={{
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(16,185,129,0.4)',
                background: canSubmitPracticeMatch
                  ? 'linear-gradient(90deg, rgba(52,211,153,0.22), rgba(16,185,129,0.22))'
                  : 'rgba(148,163,184,0.1)',
                color: canSubmitPracticeMatch ? '#34d399' : '#64748b',
                fontWeight: 900,
                cursor: canSubmitPracticeMatch ? 'pointer' : 'not-allowed',
              }}
            >
              연습경기 일정 등록
            </button>
          </div>
        </form>
      )}

      {practiceMatches.length === 0 ? (
        <div
          style={{
            border: '1px dashed rgba(148,163,184,0.35)',
            borderRadius: '14px',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            color: '#94a3b8',
            fontWeight: 700,
          }}
        >
          등록된 연습경기가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {practiceMatches.map((match) => {
            const badge = statusBadge(match);
            return (
              <div key={match.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                      {match.awayTeamName} vs {match.homeTeamName}
                    </span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        background: badge.bg,
                        color: badge.color,
                        fontWeight: 800,
                        fontSize: '11px',
                      }}
                    >
                      {badge.text}
                    </span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        background: 'rgba(16,185,129,0.16)',
                        color: '#34d399',
                        fontWeight: 800,
                        fontSize: '11px',
                      }}
                    >
                      연습경기
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        actions.selectMatch(match.id);
                        navigate('/scoreboard-text');
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#e2e8f0',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      문자중계
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        actions.selectMatch(match.id);
                        navigate('/scorekeeper');
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#e2e8f0',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      기록원
                    </button>
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '13px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>{new Date(match.startTime).toLocaleString('ko-KR')}</span>
                  <span>· {match.venue}</span>
                  <span>· 점수 {match.awayScore ?? '-'} : {match.homeScore ?? '-'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
