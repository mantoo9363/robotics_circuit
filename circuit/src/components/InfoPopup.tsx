'use client';

import React from 'react';
import type { ComponentStatus } from '../utils/componentStatus';

interface InfoPopupProps {
  status: ComponentStatus;
  onClose: () => void;
}

export function InfoPopup({ status, onClose }: InfoPopupProps) {
  const { message, details, formula, safeLimit, currentValue, educationalInfo, severity } = status;
  const isInfo = severity === 'none';
  const color = isInfo ? '#22c55e' : severity === 'error' ? '#ef4444' : '#f59e0b';
  const headerBg = isInfo ? 'rgba(34, 197, 94, 0.1)' : severity === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
  const icon = isInfo ? '⚡' : '⚠️';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 animate-popup-in"
      style={{
        top: 'calc(100% + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 260,
        zIndex: 100,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50"
        style={{ backgroundColor: headerBg }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color }}
        >
          <span style={{ fontSize: '14px' }}>{icon}</span> {message}
        </span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded p-1 transition-colors border-0 cursor-pointer flex items-center justify-center"
          style={{ width: 18, height: 18, fontSize: '10px' }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-3 text-xs text-slate-300 space-y-2.5">
        <p className="leading-relaxed text-slate-200 font-medium">{details}</p>

        {/* Dynamic Parameter Grid */}
        {(currentValue || safeLimit) && (
          <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-2 rounded-lg border border-slate-800">
            {currentValue && (
              <div>
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Measured</span>
                <span className="font-mono text-sm font-semibold" style={{ color }}>{currentValue}</span>
              </div>
            )}
            {safeLimit && (
              <div>
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Safe Limit</span>
                <span className="font-mono text-sm font-semibold text-emerald-400">{safeLimit}</span>
              </div>
            )}
          </div>
        )}

        {/* Formula Block */}
        {formula && (
          <div>
            <span className="text-[10px] text-slate-400 block mb-1 uppercase tracking-wider">Formula</span>
            <div className="bg-slate-950 px-2 py-1.5 rounded font-mono text-[11px] text-sky-400 border border-slate-800/80 text-center select-all">
              {formula}
            </div>
          </div>
        )}

        {/* Educational Info */}
        {educationalInfo && (
          <div className="border-t border-slate-800/80 pt-2 text-[11px] text-slate-400 leading-relaxed italic">
            {educationalInfo}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes popup-in {
          from {
            opacity: 0;
            transform: translate(-50%, 10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
