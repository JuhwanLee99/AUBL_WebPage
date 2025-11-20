import { Link } from 'react-router-dom';

export default function PredictionPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-900">승부 예측</h2>
      <p className="text-gray-700 leading-relaxed">
        승부 예측 기능은 곧 제공될 예정입니다. 데이터 모델을 준비하는 동안 다른 정보를 둘러보세요.
      </p>
      <div className="flex gap-4">
        <Link to="/standings" className="px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition">
          순위 살펴보기
        </Link>
        <Link to="/" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
