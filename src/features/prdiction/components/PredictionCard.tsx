// `src/features/prediction/components/PredictionCard.tsx`**
import { useState } from 'react';

export default function PredictionCard() {
  const [homeWinProb, setHomeWinProb] = useState(50);
  
  // 간단한 시뮬레이션 핸들러
  const simulate = () => {
    // 실제로는 Elo 엔진을 호출해야 함. 여기서는 랜덤값으로 데모.
    setHomeWinProb(Math.floor(Math.random() * 30) + 50); // 50~80% 사이
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-4">🔥 금주의 빅매치 예측</h3>
      <div className="flex justify-between items-center mb-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold">SSU</div>
          <p className="font-medium">SAB ONERS</p>
        </div>
        <div className="text-2xl font-bold text-gray-400">VS</div>
        <div className="text-center">
          <div className="w-16 h-16 bg-orange-500 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold">HYU</div>
          <p className="font-medium">불새</p>
        </div>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
        <div className="bg-blue-600 h-4 transition-all duration-1000" style={{ width: `${homeWinProb}%` }}></div>
      </div>
      <div className="flex justify-between text-sm font-semibold text-gray-600 mb-4">
        <span>승리 확률: {homeWinProb}%</span>
        <span>승리 확률: {100 - homeWinProb}%</span>
      </div>

      <button 
        onClick={simulate}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition"
      >
        AI 분석 실행 (Hybrid Model)
      </button>
    </div>
  );
}
