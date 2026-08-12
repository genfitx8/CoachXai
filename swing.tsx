/**
 * Standalone production entry: mount `SwingVideoAnalysis` in isolation, no
 * Firebase / server / login / app routing required. A separate Vite entry
 * point so anyone can drop a golf swing video and get pose + club metrics
 * in seconds.
 *
 * When the visitor happens to be a signed-in coach (same-origin token in
 * localStorage), we opportunistically fetch their client roster and lesson
 * history so the "회원 레슨에 저장" button + AI cross-reference light up.
 * The analyzer works either way — auth is best-effort.
 *
 * Reachable at `/swing.html` on the deployed site and locally via
 * `http://localhost:3000/swing.html` after `npm run dev`.
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { SwingVideoAnalysis } from './components/posture/SwingVideoAnalysis';
import { apiService } from './services/apiService';
import type { ClientProfile, Lesson } from './types';
import './index.css';

const App: React.FC = () => {
  const [clients, setClients] = useState<ClientProfile[] | undefined>();
  const [coachId, setCoachId] = useState<string | undefined>();
  const [studentLessons, setStudentLessons] = useState<Lesson[] | undefined>();

  useEffect(() => {
    // Best-effort: only signed-in coaches on the same origin will have a
    // token here. Any failure is silent — the standalone analyzer works
    // without it.
    if (!apiService.isAvailable?.() || !apiService.getToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const [coaches, cs, ls] = await Promise.all([
          apiService.getCoaches().catch(() => []),
          apiService.getClients().catch(() => []),
          apiService.getLessons().catch(() => []),
        ]);
        if (cancelled) return;
        // /api/coaches falls back to /api/coaches/me for non-admins, so the
        // first entry is "me" in that case.
        if (coaches.length > 0 && coaches[0]?.id) setCoachId(coaches[0].id);
        if (cs.length > 0) setClients(cs);
        if (ls.length > 0) setStudentLessons(ls);
      } catch {
        /* ignore — standalone mode still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
                골프 스윙 분석 <span className="text-emerald-400">BETA</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                스윙 mp4/mov를 업로드하면 이벤트 세그멘테이션 · 3D 바이오메카닉 지표 ·
                클럽 헤드 궤적을 즉시 계산합니다.
                {clients && clients.length > 0
                  ? ' 분석 후 회원을 선택해 레슨 기록에 바로 저장할 수 있어요.'
                  : ' 로그인 · 계정 · 서버 연결 불필요.'}
              </p>
            </div>
            <a
              href="/"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 text-xs text-slate-400 hover:text-slate-100 transition-colors flex-shrink-0"
            >
              ← 메인 앱
            </a>
          </div>
        </header>

        <SwingVideoAnalysis
          clients={clients}
          coachId={coachId}
          studentLessons={studentLessons}
        />

        <footer className="pt-4 mt-6 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed space-y-1.5">
          <p>
            첫 실행 시 MediaPipe Heavy 모델(~30MB)이 CDN에서 다운로드된 뒤 브라우저에 캐시됩니다.
            Chrome / Edge 권장 (GPU 가속).
          </p>
          <p>
            권장 촬영: 720p+ · 30fps · 5초 이내 · 정면(FO) 또는 측면(DTL) · 단색 배경.
            아이폰 슬로모(240fps) 원본은 QuickTime에서 30fps로 export 필요.
          </p>
        </footer>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('swing-root');
if (!rootElement) {
  throw new Error('#swing-root not found');
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
