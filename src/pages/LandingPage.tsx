// **`src/pages/LandingPage.tsx`**
import { Link } from 'react-router-dom';

const features = [
  {
    title: '실시간 Elo 순위',
    desc: '경기 결과와 점수 차를 반영한 라이브 Elo 레이팅으로 팀 전력을 한눈에 확인하세요.',
  },
  {
    title: '팀·선수 데이터',
    desc: '팀 기록부터 선수별 세부 스탯까지, 데이터 중심으로 분석된 정보를 제공합니다.',
  },
  {
    title: '예측 서비스',
    desc: '머신러닝 기반의 승부 예측 기능으로 다음 경기를 더 흥미롭게 즐겨보세요.',
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-r from-slate-900 to-slate-800 text-white py-20 px-6 rounded-3xl overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-5xl font-extrabold mb-6 leading-tight">
            대학 야구의 열정, <br />
            <span className="text-orange-500">데이터</span>로 증명하다.
          </h1>
          <p className="text-lg text-gray-300 mb-8">
            AUBL 공식 데이터 플랫폼에 오신 것을 환영합니다.
            Elo 레이팅 기반 순위, 실시간 스코어, 승부예측을 경험하세요.
          </p>
          <div className="flex gap-4">
            <Link to="/standings" className="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-bold transition">
              순위 보기
            </Link>
            <Link to="/prediction" className="px-6 py-3 bg-white text-slate-900 hover:bg-gray-100 rounded-lg font-bold transition">
              승부 예측하기
            </Link>
          </div>
        </div>
        {/* Background Pattern */}
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-20 bg-[url('https://images.unsplash.com/photo-1587280501635-68a6e82cd7db?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80')] bg-cover bg-center"></div>
      </section>

      {/* Feature Grid */}
      <section className="grid md:grid-cols-3 gap-6">
        {features.map((item, i) => (
          <div key={i} className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
            <h3 className="text-xl font-bold text-slate-800 mb-2">{item.title}</h3>
            <p className="text-gray-600">{item.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
