import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';
import type { PlayerSlot, Half, Bases, PlayLog, PlayEvent } from '@shared/state/demoStore';

interface GameState {
  inning: number;
  half: Half;
  balls: number;
  strikes: number;
  outs: number;
  pitchCount?: number;
  bases: Bases;
  score: { home: number; away: number };
  lastPlay: string;
  homeTeamId: string;
  awayTeamId: string;
  batterIndex: { home: number; away: number };
  lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
  teamNames: { home: string; away: string };
  feed?: PlayLog[];
  events?: PlayEvent[];
  gameTimer?: number; // 남은 시간 (초)
}

const FEED_LIMIT = 50;

export default function IndependentScoreboardPanel({
  matchId,
  style,
}: {
  matchId: string;
  style?: CSSProperties;
}) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  // Firestore에서 경기 데이터 구독
  useEffect(() => {
    const stateDoc = doc(firestore, 'matchStates', matchId);

    // 먼저 초기 데이터 로드
    const loadInitialData = async () => {
      try {
        const [feedSnap, eventsSnap] = await Promise.all([
          getDocs(
            query(
              collection(firestore, 'matchStates', matchId, 'feed'),
              orderBy('createdAt', 'desc'),
              limit(FEED_LIMIT),
            ),
          ),
          getDocs(
            query(
              collection(firestore, 'matchStates', matchId, 'events'),
              orderBy('createdAt', 'desc'),
              limit(FEED_LIMIT),
            ),
          ),
        ]);

        const feedEntries = feedSnap.docs.map((d) => d.data() as PlayLog);
        const eventEntries = eventsSnap.docs.map((d) => d.data() as PlayEvent);

        return { feed: feedEntries, events: eventEntries };
      } catch (error) {
        console.error('[IndependentScoreboardPanel] Error loading subcollections:', error);
        return { feed: [], events: [] };
      }
    };

    // matchStates 문서 구독
    const unsubscribe = onSnapshot(
      stateDoc,
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const { feed, events } = await loadInitialData();

          setGameState({
            inning: data.inning ?? 1,
            half: (data.half ?? 'top') as Half,
            balls: data.balls ?? 0,
            strikes: data.strikes ?? 0,
            outs: data.outs ?? 0,
            pitchCount: data.pitchCount ?? 0,
            bases: (data.bases ?? ['', '', '']) as Bases,
            score: data.score ?? { home: 0, away: 0 },
            lastPlay: data.lastPlay ?? '',
            homeTeamId: data.homeTeamId ?? '',
            awayTeamId: data.awayTeamId ?? '',
            batterIndex: data.batterIndex ?? { home: 0, away: 0 },
            lineups: data.lineups ?? { home: [], away: [] },
            teamNames: data.teamNames ?? { home: '', away: '' },
            feed,
            events,
            gameTimer: data.gameTimer,
          });
          setLoading(false);
        } else {
          setLoading(false);
        }
      },
      (error) => {
        console.error('[IndependentScoreboardPanel] Snapshot error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  if (loading || !gameState) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <div style={{ color: '#94a3b8', fontSize: '14px' }}>로딩 중...</div>
      </div>
    );
  }

  const hittingSide = gameState.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineup = gameState.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeOffense = offenseLineup.length ? offenseLineup : gameState.lineups[hittingSide];

  const currentBatterSlot = activeOffense[gameState.batterIndex[hittingSide] % Math.max(activeOffense.length, 1)];
  const currentBatter = currentBatterSlot?.name || '타자';

  const currentPitcherSlot = gameState.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P');
  const currentPitcher = currentPitcherSlot?.name || '투수';

  const inningHalf = gameState.half === 'top' ? '▲' : '▼';

  return (
    <div
      style={{
        ...style,
        background: '#0a0a0a',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        gap: '12px',
      }}
    >
      {/* 점수판 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>AWAY</div>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>{gameState.teamNames.away}</div>
        </div>
        <div style={{ fontSize: '32px', fontWeight: 900, color: '#38bdf8' }}>
          {gameState.score.away}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>HOME</div>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>{gameState.teamNames.home}</div>
        </div>
        <div style={{ fontSize: '32px', fontWeight: 900, color: '#38bdf8' }}>
          {gameState.score.home}
        </div>
      </div>

      <div style={{ height: '1px', background: 'rgba(148, 163, 184, 0.2)', margin: '8px 0' }} />

      {/* 이닝 및 카운트 (신호등 스타일) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        {/* 이닝 */}
        <div style={{ flex: 1 }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>이닝</div>
          <div style={{ fontSize: '18px', fontWeight: 900 }}>
            {inningHalf}{gameState.inning}
          </div>
        </div>

        {/* 볼/스트라이크/아웃 신호등 */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* 볼 (Ball) - 녹색 */}
          <div>
            <div style={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px', textAlign: 'center' }}>B</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={`ball-${i}`}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: i < gameState.balls ? '#22c55e' : 'rgba(148, 163, 184, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    boxShadow: i < gameState.balls ? '0 0 8px rgba(34, 197, 94, 0.6)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 스트라이크 (Strike) - 노란색 */}
          <div>
            <div style={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px', textAlign: 'center' }}>S</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={`strike-${i}`}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: i < gameState.strikes ? '#f59e0b' : 'rgba(148, 163, 184, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    boxShadow: i < gameState.strikes ? '0 0 8px rgba(245, 158, 11, 0.6)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 아웃 (Out) - 빨간색 */}
          <div>
            <div style={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px', textAlign: 'center' }}>O</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={`out-${i}`}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: i < gameState.outs ? '#ef4444' : 'rgba(148, 163, 184, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    boxShadow: i < gameState.outs ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 남은 시간 (있는 경우) */}
        {gameState.gameTimer !== undefined && gameState.gameTimer > 0 && (
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>남은 시간</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>
              {Math.floor(gameState.gameTimer / 60)}:{String(gameState.gameTimer % 60).padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      {/* 주루 상황 */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 0' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px' }}>
          {/* 다이아몬드 */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(45deg)',
              width: '60px',
              height: '60px',
              border: '2px solid rgba(148, 163, 184, 0.3)',
            }}
          />
          {/* 2루 */}
          <div
            style={{
              position: 'absolute',
              top: '0',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              background: gameState.bases[1] ? '#facc15' : 'rgba(148, 163, 184, 0.2)',
              border: '2px solid #1e293b',
            }}
          />
          {/* 3루 */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '0',
              transform: 'translateY(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              background: gameState.bases[2] ? '#facc15' : 'rgba(148, 163, 184, 0.2)',
              border: '2px solid #1e293b',
            }}
          />
          {/* 1루 */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              right: '0',
              transform: 'translateY(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              background: gameState.bases[0] ? '#facc15' : 'rgba(148, 163, 184, 0.2)',
              border: '2px solid #1e293b',
            }}
          />
        </div>
      </div>

      <div style={{ height: '1px', background: 'rgba(148, 163, 184, 0.2)', margin: '8px 0' }} />

      {/* 타자/투수 */}
      <div style={{ fontSize: '12px' }}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>타자</div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{currentBatter}</div>
        </div>
        <div>
          <div style={{ color: '#94a3b8', marginBottom: '4px' }}>투수</div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{currentPitcher}</div>
        </div>
      </div>

      {/* 최근 플레이 */}
      {gameState.lastPlay && (
        <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px' }}>
          <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>최근 플레이</div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>{gameState.lastPlay}</div>
        </div>
      )}
    </div>
  );
}
