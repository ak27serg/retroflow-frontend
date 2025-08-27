'use client';

import { useState, useEffect } from 'react';

interface TimerProps {
  endTime: string | null;
  onTimeUp?: () => void;
  className?: string;
}

export default function Timer({ endTime, onTimeUp, className = '' }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (!endTime) {
      setTimeLeft(0);
      setIsFinished(false);
      return;
    }

    const targetTime = new Date(endTime).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const remaining = Math.max(0, targetTime - now);
      const remainingSeconds = Math.floor(remaining / 1000);
      
      setTimeLeft(remainingSeconds);
      
      if (remaining <= 0 && !isFinished) {
        setIsFinished(true);
        onTimeUp?.();
      }
    };

    // Update immediately
    updateTimer();

    // Then update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, onTimeUp, isFinished]);

  if (!endTime || timeLeft <= 0) {
    return null;
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  // Color based on time remaining
  const getColorClass = () => {
    if (timeLeft > 120) return 'text-green-600'; // > 2 minutes
    if (timeLeft > 60) return 'text-yellow-600';  // > 1 minute
    return 'text-red-600'; // < 1 minute
  };

  const getBackgroundClass = () => {
    if (timeLeft > 120) return 'bg-green-50 border-green-200';
    if (timeLeft > 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className={`flex items-center justify-center gap-3 p-4 rounded-lg border-2 ${getBackgroundClass()} ${className}`}>
      <div className="text-2xl">⏰</div>
      <div className="text-center">
        <div className={`text-3xl font-bold font-mono ${getColorClass()}`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
        <div className="text-sm text-gray-600">Time remaining</div>
      </div>
    </div>
  );
}