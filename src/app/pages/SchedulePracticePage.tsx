import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../shared/auth/useAdmin';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
  SeasonLinkButton,
  type SeasonBadgeTone,
} from '../../shared/components/season';
import { TEAMS } from '../../shared/lib/mockData';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';
import './SchedulePublicPages.css';

const statusBadge = (match: MatchSchedule): { text: string; tone: SeasonBadgeTone } => {
  if (match.status === 'inProgress') return { text: '진행 중', tone: 'blue' };
  if (match.status === 'completed') return { text: '종료', tone: 'navy' };
  if (match.status === 'canceled') return { text: '취소', tone: 'muted' };
  return { text: '예정', tone: 'muted' };
};

type PracticePlayerSlot = NonNullable<MatchSchedule['lineups']>['home'][number];

const makePracticeLineup = (): PracticePlayerSlot[] => [
  ...Array.from({ length: 9 }, () => ({
    name: '',
    pos: '',
    number: '',
    throws: 'R',
    bats: 'R',
  })),
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
        .filter((match) => !match.deleted && (match.recordMode ?? 'official') === 'practice')
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

  const openTextBroadcast = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scoreboard-text/${matchId}`);
  };

  const openScorekeeper = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scorekeeper/${matchId}`);
  };

  return (
    <div className="schedule-public schedule-public--practice">
      <PageHero
        eyebrow="2026 SEASON · PRACTICE"
        title="연습경기"
        description={<p>공식기록에 반영되지 않는 연습경기 일정과 진행 상태를 확인합니다.</p>}
        actions={
          <>
            {isAdmin ? (
              <SeasonButton
                variant={showAddForm ? 'ghost' : 'primary'}
                onClick={() => setShowAddForm((previous) => !previous)}
              >
                {showAddForm ? '추가 폼 닫기' : '연습경기 추가'}
              </SeasonButton>
            ) : null}
            <SeasonLinkButton to="/schedule" variant="secondary">
              일정 메인
            </SeasonLinkButton>
          </>
        }
        aside={
          <div className="schedule-public__hero-aside" aria-label="연습경기 수">
            <span>PRACTICE GAMES</span>
            <strong>{practiceMatches.length}</strong>
            <small>등록된 일정</small>
          </div>
        }
      />

      {isAdmin && showAddForm ? (
        <form className="schedule-public__practice-form" onSubmit={handleCreatePracticeMatch}>
          <SectionHeader
            eyebrow="ADMIN TOOL"
            title="연습경기 일정 등록"
            description="팀과 경기 일시를 확인한 뒤 공식기록 미반영 일정으로 등록합니다."
          />

          <div className="schedule-public__practice-teams">
            <fieldset>
              <legend>홈 팀</legend>
              <label className="schedule-public__field">
                <span>등록 팀 선택</span>
                <select
                  value={form.homeTeamId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextTeam = TEAMS.find((team) => team.id === nextId);
                    setForm((previous) => ({
                      ...previous,
                      homeTeamId: nextId,
                      homeTeamName: nextTeam?.name ?? previous.homeTeamName,
                    }));
                  }}
                >
                  <option value="">팀 선택 (직접 입력 가능)</option>
                  {TEAMS.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="schedule-public__field">
                <span>홈 팀명</span>
                <input
                  value={form.homeTeamName}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, homeTeamName: event.target.value }))
                  }
                  placeholder="HOME 팀명"
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>원정 팀</legend>
              <label className="schedule-public__field">
                <span>등록 팀 선택</span>
                <select
                  value={form.awayTeamId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextTeam = TEAMS.find((team) => team.id === nextId);
                    setForm((previous) => ({
                      ...previous,
                      awayTeamId: nextId,
                      awayTeamName: nextTeam?.name ?? previous.awayTeamName,
                    }));
                  }}
                >
                  <option value="">팀 선택 (직접 입력 가능)</option>
                  {TEAMS.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="schedule-public__field">
                <span>원정 팀명</span>
                <input
                  value={form.awayTeamName}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, awayTeamName: event.target.value }))
                  }
                  placeholder="AWAY 팀명"
                />
              </label>
            </fieldset>
          </div>

          <div className="schedule-public__practice-details">
            <label className="schedule-public__field">
              <span>경기 일시</span>
              <input
                type="datetime-local"
                value={form.startAtLocal}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, startAtLocal: event.target.value }))
                }
              />
            </label>

            <label className="schedule-public__field">
              <span>장소</span>
              <input
                value={form.venue}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, venue: event.target.value }))
                }
                placeholder="예: AUBL 연습구장"
              />
            </label>

            <label className="schedule-public__field">
              <span>상태</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    status: event.target.value as MatchSchedule['status'],
                  }))
                }
              >
                <option value="scheduled">예정</option>
                <option value="inProgress">진행 중</option>
                <option value="completed">종료</option>
                <option value="canceled">취소</option>
              </select>
            </label>
          </div>

          <label className="schedule-public__field">
            <span>메모 (선택)</span>
            <input
              value={form.notes}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, notes: event.target.value }))
              }
              placeholder="연습경기 비고"
            />
          </label>

          <div className="schedule-public__practice-submit">
            <SeasonButton type="submit" disabled={!canSubmitPracticeMatch}>
              연습경기 일정 등록
            </SeasonButton>
          </div>
        </form>
      ) : null}

      <section className="schedule-public__board" aria-labelledby="practice-list-title">
        <SectionHeader
          eyebrow="PRACTICE SCHEDULE"
          title="연습경기 목록"
          description="공식 일정과 구분하여 경기 상태와 스코어를 확인할 수 있습니다."
          headingId="practice-list-title"
          action={<SeasonBadge tone="muted">{practiceMatches.length} 경기</SeasonBadge>}
        />

        {practiceMatches.length === 0 ? (
          <div className="schedule-public__empty" role="status">
            <strong>등록된 연습경기가 없습니다.</strong>
            <span>새 일정이 등록되면 이곳에 표시됩니다.</span>
          </div>
        ) : (
          <div className="schedule-public__practice-list">
            {practiceMatches.map((match) => {
              const badge = statusBadge(match);
              return (
                <article key={match.id} className="schedule-public__practice-match">
                  <div className="schedule-public__practice-meta">
                    <time dateTime={match.startTime}>
                      {new Date(match.startTime).toLocaleString('ko-KR')}
                    </time>
                    <span>{match.venue}</span>
                    <div>
                      <SeasonBadge tone={badge.tone}>{badge.text}</SeasonBadge>
                      <SeasonBadge tone="muted">연습경기</SeasonBadge>
                    </div>
                  </div>

                  <div
                    className="schedule-public__score"
                    aria-label={`${match.awayTeamName} 대 ${match.homeTeamName}`}
                  >
                    <div>
                      <span>원정</span>
                      <strong>{match.awayTeamName}</strong>
                      <b>{match.awayScore ?? '-'}</b>
                    </div>
                    <div>
                      <span>홈</span>
                      <strong>{match.homeTeamName}</strong>
                      <b>{match.homeScore ?? '-'}</b>
                    </div>
                  </div>

                  <div className="schedule-public__practice-actions">
                    <SeasonButton
                      variant="secondary"
                      size="compact"
                      onClick={() => openTextBroadcast(match.id)}
                    >
                      문자중계
                    </SeasonButton>
                    <SeasonButton
                      variant="ghost"
                      size="compact"
                      onClick={() => openScorekeeper(match.id)}
                    >
                      기록원
                    </SeasonButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
