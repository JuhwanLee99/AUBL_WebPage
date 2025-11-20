// **`src/pages/StandingsPage.tsx`**
import { useMemo } from 'react';
import { TEAMS, MATCHES } from '../shared/lib/mockData';
import { calculateRankings } from '../features/rankings/utils/rankingEngine';

export default function StandingsPage() {
  const rankings = useMemo(() => calculateRankings(TEAMS, MATCHES), [TEAMS, MATCHES]);

  return (
    <div>
      <h2 className="text-3xl font-bold text-slate-900 mb-8">📊 리그 순위 (Live Elo)</h2>
      <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-sm uppercase tracking-wider border-b border-gray-200">
              <th className="p-4 font-bold">순위</th>
              <th className="p-4 font-bold">팀</th>
              <th className="p-4 font-bold text-center">경기</th>
              <th className="p-4 font-bold text-center">승/무/패</th>
              <th className="p-4 font-bold text-right">Elo Rating</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((team, index) => (
              <tr key={team.teamId} className="border-b border-gray-100 hover:bg-slate-50 transition">
                <td className="p-4 font-bold text-slate-500">{index + 1}</td>
                <td className="p-4 font-medium text-slate-900">{team.teamName}</td>
                <td className="p-4 text-center text-gray-600">{team.wins + team.losses + team.draws}</td>
                <td className="p-4 text-center text-gray-600">{team.wins}-{team.draws}-{team.losses}</td>
                <td className="p-4 text-right font-bold text-indigo-600">{team.eloRating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-gray-500 text-right">
        * Elo Rating은 경기 승패 및 점수 차(Margin of Victory)를 기반으로 자동 산출됩니다.
      </p>
    </div>
  );
}