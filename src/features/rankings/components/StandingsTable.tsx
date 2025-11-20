import React from 'react';
import type { TeamRanking } from '../../../shared/types';

interface Props {
  teams: TeamRanking[];
  groupName: string;
}

const StandingsTable: React.FC<Props> = ({ teams, groupName }) => {
  // Elo 점수 기준으로 내림차순 정렬
  const sortedTeams = [...teams].sort((a, b) => b.eloRating - a.eloRating);

  return (
    <div className="w-full bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 bg-blue-900 text-white font-bold flex justify-between">
        <span>{groupName} 순위</span>
        <span className="text-xs bg-blue-700 px-2 py-1 rounded">Live Elo</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-4 py-3">순위</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3 text-center">승/무/패</th>
              <th className="px-4 py-3 text-right">Elo Rating</th>
              <th className="px-4 py-3 text-right text-blue-600">예측력(BT)</th>
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, index) => (
              <tr key={team.teamId} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{index + 1}</td>
                <td className="px-4 py-3 flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{team.teamName}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {team.wins}-{team.draws}-{team.losses}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {Math.round(team.eloRating)}
                </td>
                <td className="px-4 py-3 text-right">
                  {Math.round(team.btIndex)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StandingsTable;