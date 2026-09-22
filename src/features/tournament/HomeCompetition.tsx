import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import TournamentBoard from './TournamentBoard';
import { usePublicTournament } from './store';
import type { HomeGroupView } from '@features/front/components/season2026/types';

export default function HomeCompetition({ children, groups }: { children: ReactNode; groups: HomeGroupView[] }) {
  const { config } = usePublicTournament();
  const [choice, setChoice] = useState<'groups' | 'tournament' | null>(null);
  if (!config) return <>{children}</>;
  const selected = choice ?? config.homeDefault;
  return <div className="t26-home-region">
    <div className="t26-toggle t26-home-toggle" role="group" aria-label="리그 현황 화면">
      <button type="button" aria-pressed={selected === 'tournament'} onClick={() => setChoice('tournament')}>토너먼트 대진 · 일정</button>
      <button type="button" aria-pressed={selected === 'groups'} onClick={() => setChoice('groups')}>조별예선 현황</button>
    </div>
    <div hidden={selected !== 'groups'}>{children}</div>
    {selected === 'tournament' && <section className="s26-section">
      <div className="s26-section-heading"><div><p className="s26-eyebrow">2026 POSTSEASON</p><h2>토너먼트 대진 · 일정</h2></div><Link to="/tournament">대진표 상세</Link></div>
      <TournamentBoard config={config} groups={groups} />
    </section>}
  </div>;
}
