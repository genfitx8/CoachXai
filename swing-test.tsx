/**
 * Dev-only entry that mounts SwingVideoAnalysis in isolation — no Firebase,
 * no backend, no login flow, no navigation. Open `/swing-test.html` after
 * `npm run dev` to iterate on the swing pipeline alone.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SwingVideoAnalysis } from './components/posture/SwingVideoAnalysis';
import './index.css';

const App: React.FC = () => (
  <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
    <div className="max-w-3xl mx-auto space-y-4">
      <header className="pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/60">
            DEV
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
            스윙 분석 스탠드얼론
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
          Firebase / 서버 / 로그인 없이 <code className="text-emerald-400">SwingVideoAnalysis</code>{' '}
          컴포넌트만 마운트합니다. 스윙 mp4/mov를 업로드해 파이프라인을 즉시 테스트하세요.
          <br />
          첫 실행 시 MediaPipe Heavy 모델(~30MB)이 CDN에서 다운로드됩니다.
        </p>
      </header>
      <SwingVideoAnalysis />
      <footer className="pt-4 mt-6 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
        경로: <code>/swing-test.html</code> · 컴포넌트:{' '}
        <code>components/posture/SwingVideoAnalysis.tsx</code> · 서비스:{' '}
        <code>services/swingAnalysisService.ts</code> +{' '}
        <code>services/clubHeadTrackingService.ts</code>
      </footer>
    </div>
  </div>
);

const rootElement = document.getElementById('swing-test-root');
if (!rootElement) {
  throw new Error('#swing-test-root not found');
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
