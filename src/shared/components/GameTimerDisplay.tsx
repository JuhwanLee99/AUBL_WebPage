import { useEffect, useState } from 'react';

interface GameTimerDisplayProps {
  gameLimitMinutes: number | null;
  gameStartTimestamp: number | null;
  gamePausedAt: number | null;
  gamePausedDuration: number;
  gameStarted: boolean;
  style?: React.CSSProperties;
}

export function GameTimerDisplay({
  gameLimitMinutes,
  gameStartTimestamp,
  gamePausedAt,
  gamePausedDuration,
  gameStarted,
  style,
}: GameTimerDisplayProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const shouldTrackTimer = gameStarted && gameLimitMinutes !== null && gameStartTimestamp !== null;

  useEffect(() => {
    if (!shouldTrackTimer) return;

    const updateTimer = () => {
      const now = Date.now();
      const totalLimitMs = gameLimitMinutes * 60 * 1000;

      let elapsedMs: number;
      if (gamePausedAt !== null) {
        elapsedMs = (gamePausedAt - gameStartTimestamp) - gamePausedDuration;
      } else {
        elapsedMs = (now - gameStartTimestamp) - gamePausedDuration;
      }

      const remaining = totalLimitMs - elapsedMs;
      setRemainingMs(Math.max(0, remaining));
    };

    const firstTick = setTimeout(updateTimer, 0);
    const interval = setInterval(updateTimer, 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(interval);
    };
  }, [gameLimitMinutes, gamePausedAt, gamePausedDuration, gameStartTimestamp, shouldTrackTimer]);

  if (!shouldTrackTimer || remainingMs === null) return null;

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isWarning = remainingMs < 5 * 60 * 1000; // 마지막 5분
  const isCritical = remainingMs < 1 * 60 * 1000; // 마지막 1분
  const isExpired = remainingMs === 0;

  const displayText = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      style={{
        padding: '8px 14px',
        borderRadius: '10px',
        border: `2px solid ${isExpired ? '#ef4444' : isCritical ? '#f97316' : isWarning ? '#facc15' : '#22c55e'}`,
        background: isExpired ? 'rgba(239,68,68,0.15)' : isCritical ? 'rgba(249,115,22,0.15)' : isWarning ? 'rgba(250,204,21,0.15)' : 'rgba(34,197,94,0.15)',
        color: isExpired ? '#fca5a5' : isCritical ? '#fdba74' : isWarning ? '#fde047' : '#86efac',
        fontWeight: 900,
        fontSize: '14px',
        fontFamily: 'monospace',
        textAlign: 'center',
        ...style,
      }}
    >
      {gamePausedAt !== null && '⏸ '}
      {isExpired ? '시간 종료' : `남은 시간: ${displayText}`}
    </div>
  );
}
