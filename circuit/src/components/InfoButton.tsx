'use client';

import React from 'react';

interface InfoButtonProps {
  severity: 'warning' | 'error' | 'info';
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function InfoButton({ severity, onClick }: InfoButtonProps) {
  const color =
    severity === 'error' ? '#ef4444' :
    severity === 'info'  ? '#22c55e' :
    '#f59e0b';
  const glowColor =
    severity === 'error' ? 'rgba(239, 68, 68, 0.4)' :
    severity === 'info'  ? 'rgba(34, 197, 94, 0.4)' :
    'rgba(245, 158, 11, 0.4)';

  const icon = severity === 'info' ? '⚡' : '!';
  const title = severity === 'info'
    ? 'Click to see current flowing through LED'
    : 'Component Anomaly Detected! Click for details.';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="absolute flex items-center justify-center focus:outline-none transition-all duration-200 hover:scale-110 active:scale-95"
      style={{
        top: -8,
        right: -8,
        width: 22,
        height: 22,
        borderRadius: '50%',
        backgroundColor: color,
        border: '2px solid #ffffff',
        boxShadow: `0 0 0 0 ${glowColor}, 0 2px 6px rgba(0, 0, 0, 0.25)`,
        color: '#ffffff',
        cursor: 'pointer',
        zIndex: 50,
        fontSize: severity === 'info' ? '10px' : '12px',
        fontWeight: 'bold',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'info-button-heartbeat 2s infinite ease-in-out',
      }}
      title={title}
      aria-label={title}
    >
      <span style={{ transform: 'translateY(-0.5px)' }}>{icon}</span>

      <style jsx global>{`
        @keyframes info-button-heartbeat {
          0% {
            box-shadow: 0 0 0 0 ${glowColor}, 0 2px 6px rgba(0, 0, 0, 0.25);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(0, 0, 0, 0), 0 2px 6px rgba(0, 0, 0, 0.25);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(0, 0, 0, 0), 0 2px 6px rgba(0, 0, 0, 0.25);
          }
        }
      `}</style>
    </button>
  );
}
