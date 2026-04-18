import React from 'react';

interface SwingGuideOverlayProps {
  type: 'FRONT' | 'SIDE';
}

export const SwingGuideOverlay: React.FC<SwingGuideOverlayProps> = ({ type }) => {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 opacity-60">
      <svg 
        viewBox="0 0 100 100" 
        className="w-full h-full p-8" 
        preserveAspectRatio="none"
      >
        {type === 'FRONT' ? (
          <>
            {/* HEAD */}
            <circle cx="50" cy="20" r="8" fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* SPINE */}
            <line x1="50" y1="28" x2="50" y2="60" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* SHOULDERS */}
            <line x1="35" y1="35" x2="65" y2="35" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* HIPS */}
            <line x1="40" y1="60" x2="60" y2="60" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* LEGS */}
            <line x1="40" y1="60" x2="35" y2="90" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            <line x1="60" y1="60" x2="65" y2="90" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* GROUND LINE */}
            <line x1="20" y1="90" x2="80" y2="90" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
            
            {/* ALIGNMENT BOX */}
            <rect x="25" y="10" width="50" height="85" fill="none" stroke="rgba(16, 185, 129, 0.3)" strokeWidth="0.5" rx="2" />
            
            <text x="50" y="5" textAnchor="middle" fill="white" fontSize="4" fontWeight="bold">정면 (Front)</text>
          </>
        ) : (
          <>
            {/* HEAD */}
            <circle cx="50" cy="20" r="7" fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* SPINE ANGLE */}
            <line x1="50" y1="25" x2="35" y2="60" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            {/* LEGS */}
            <line x1="35" y1="60" x2="35" y2="90" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            <line x1="35" y1="60" x2="45" y2="90" stroke="white" strokeWidth="1" strokeDasharray="4 2" />
            
            {/* CLUB SHAFT PLANE (Guide) */}
            <line x1="10" y1="90" x2="80" y2="40" stroke="rgba(255, 234, 0, 0.6)" strokeWidth="1" strokeDasharray="2 2" />
            
            {/* ALIGNMENT BOX */}
            <rect x="20" y="10" width="60" height="85" fill="none" stroke="rgba(16, 185, 129, 0.3)" strokeWidth="0.5" rx="2" />

            <text x="50" y="5" textAnchor="middle" fill="white" fontSize="4" fontWeight="bold">측면 (Side)</text>
          </>
        )}
      </svg>
      
      {/* Helper Text Overlay */}
      <div className="absolute top-4 left-0 right-0 text-center">
        <p className="text-white text-xs bg-black/40 inline-block px-3 py-1 rounded-full backdrop-blur-sm border border-white/20 shadow-sm">
            {type === 'FRONT' ? '양발을 가이드 라인에 맞추세요' : '척추 각도와 샤프트 라인을 참고하세요'}
        </p>
      </div>
    </div>
  );
};