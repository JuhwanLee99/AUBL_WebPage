import { Link } from 'react-router-dom';

export default function IntroPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-900">리그 소개</h2>
      <p className="text-gray-700 leading-relaxed">
        AUBL은 대학 야구 팀들이 실력을 겨루고 데이터를 통해 성장을 확인하는 리그입니다.
        팀별 Elo 레이팅, 경기 기록, 하이라이트 등 다양한 정보를 제공하여 팬들과 선수들이
        함께 즐길 수 있는 경험을 만듭니다.
      </p>
      <div className="flex gap-4">
        <Link to="/standings" className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition">
          현재 순위 보기
        </Link>
        <Link to="/" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
