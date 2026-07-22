import React from 'react';
import { DispersionSession } from '../types';
import { Target, CircleDot, Crosshair } from 'lucide-react';

interface Props {
  session: DispersionSession;
  currentDate?: string;
}

const formatSide = (sideM?: number): string => {
  if (sideM === undefined) return '-';
  if (sideM === 0) return 'C';
  const abs = Math.abs(sideM).toFixed(1);
  return sideM > 0 ? `${abs}R` : `${abs}L`;
};

export const DispersionSessionCard: React.FC<Props> = ({ session, currentDate }) => {
  const hitRatePct =
    session.shotCount > 0
      ? Math.round((session.hitCount / session.shotCount) * 100)
      : 0;

  const sortedShots = [...session.shots].sort((a, b) => a.shotNo - b.shotNo);
  const bestShot = sortedShots.reduce<typeof sortedShots[number] | null>(
    (best, s) => (best === null || s.pinDistanceM < best.pinDistanceM ? s : best),
    null,
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex justify-between items-center">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-emerald-200" />
          근접샷 세션 · {session.club} · 목표 {session.targetDistanceM}m
        </h3>
        {currentDate && (
          <span className="text-emerald-100 text-xs">{currentDate}</span>
        )}
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col items-center">
            <span className="text-gray-500 text-xs font-medium mb-1">총 샷</span>
            <div className="text-2xl font-bold text-gray-900">
              {session.shotCount}
              <span className="text-sm font-normal text-gray-400"> 회</span>
            </div>
          </div>
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col items-center">
            <span className="text-emerald-700 text-xs font-medium mb-1 flex items-center gap-1">
              <Target className="w-3 h-3" /> 명중률
            </span>
            <div className="text-2xl font-bold text-emerald-700">
              {hitRatePct}
              <span className="text-sm font-normal text-emerald-500">%</span>
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5">
              {session.hitCount}/{session.shotCount}
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center">
            <span className="text-blue-700 text-xs font-medium mb-1">평균 핀거리</span>
            <div className="text-2xl font-bold text-blue-700">
              {session.avgPinDistanceM.toFixed(1)}
              <span className="text-sm font-normal text-blue-500"> m</span>
            </div>
          </div>
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col items-center">
            <span className="text-indigo-700 text-xs font-medium mb-1 flex items-center gap-1">
              <CircleDot className="w-3 h-3" /> 최근접
            </span>
            <div className="text-2xl font-bold text-indigo-700">
              {bestShot ? bestShot.pinDistanceM.toFixed(1) : '-'}
              <span className="text-sm font-normal text-indigo-500"> m</span>
            </div>
            <div className="text-[10px] text-indigo-600 mt-0.5">
              {bestShot ? `#${bestShot.shotNo}` : '-'}
            </div>
          </div>
        </div>

        {sortedShots.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2 border-l-4 border-emerald-500 pl-3">
              샷별 기록
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium">#</th>
                    <th className="text-right py-2 px-2 font-medium">핀 이격</th>
                    <th className="text-right py-2 px-2 font-medium">좌우</th>
                    <th className="text-center py-2 px-2 font-medium">명중</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedShots.map((shot) => (
                    <tr key={shot.shotNo} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2 px-2 text-gray-600 font-medium">#{shot.shotNo}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-800">
                        {shot.pinDistanceM.toFixed(1)}
                        <span className="text-xs font-normal text-gray-400"> m</span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {formatSide(shot.sideM)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {shot.hitTarget === true ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        ) : shot.hitTarget === false ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedShots.length < session.shotCount && (
              <p className="text-xs text-gray-400 mt-2">
                * 화면에 보이는 최근 {sortedShots.length}개만 기록되었습니다 (총 {session.shotCount}회 중).
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
