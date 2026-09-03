import { ActionLinkButton, PageHero, SectionHeader, StatusBadge } from '@shared/components/season';
import './PredictionPage.css';

const upcoming = [
  {
    title: '라인업 기반 예측',
    desc: '투수·타자 매치업과 최근 컨디션, 홈·원정 지표를 반영한 승리 확률을 준비하고 있습니다.',
  },
  {
    title: '예측 방식 비교',
    desc: 'Elo와 통계 모델의 결과를 나란히 검증하고 누적 정확도를 투명하게 공개합니다.',
  },
  {
    title: '경기 중 갱신',
    desc: '득점과 선수 교체가 발생하면 경기 흐름에 맞춰 확률을 다시 계산합니다.',
  },
];

const steps = [
  '과거 경기 데이터를 정제하고 누락·중복을 검사합니다.',
  'Elo, 최근 경기력, 라인업 정보를 비교 가능한 지표로 만듭니다.',
  '시즌별 백테스트로 오차와 편향을 확인합니다.',
  '운영 검수를 통과한 결과만 공개 화면에 연결합니다.',
];

export default function PredictionPage() {
  return (
    <div className="prediction-page">
      <PageHero
        eyebrow="승부예측"
        title={<>경기 데이터를 읽는<br />또 하나의 관점</>}
        description={
          <p>
            라인업, 최근 경기력, Elo와 홈·원정 기록을 함께 살펴 승리 가능성을 계산하는 기능입니다.
            현재는 검증 단계이며, 충분한 정확도와 설명 가능성을 확보한 뒤 공개합니다.
          </p>
        }
        actions={
          <>
            <ActionLinkButton to="/records?tab=standings">현재 순위 보기</ActionLinkButton>
            <ActionLinkButton to="/schedule" variant="secondary">경기 일정 보기</ActionLinkButton>
          </>
        }
        aside={<StatusBadge tone="warning">검증 중</StatusBadge>}
      />

      <section className="prediction-panel" aria-labelledby="prediction-features-title">
        <SectionHeader
          headingId="prediction-features-title"
          eyebrow="제공 예정"
          title="준비 중인 기능"
          description="과장된 모델 명칭 대신 실제로 확인할 수 있는 입력과 결과를 중심으로 제공합니다."
        />
        <div className="prediction-feature-grid">
          {upcoming.map((item, index) => (
            <article key={item.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="prediction-panel" aria-labelledby="prediction-process-title">
        <SectionHeader
          headingId="prediction-process-title"
          eyebrow="검증 절차"
          title="공개 전 확인 과정"
          description="확률만 보여주는 기능이 아니라, 데이터 시점과 검증 기준을 함께 설명합니다."
        />
        <ol className="prediction-process">
          {steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <p className="prediction-note">
          승부예측은 참고 정보이며 실제 경기 결과를 보장하지 않습니다. 준비가 끝날 때까지 기존 일정·기록 기능은 그대로 이용할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
