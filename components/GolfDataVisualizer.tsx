
import React, { useMemo } from 'react';
import { GolfData, Lesson } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from 'lucide-react';

interface GolfDataVisualizerProps {
  currentData: GolfData;
  allLessons: Lesson[];
  clientName: string;
  clientPhone: string;
  currentClub?: string;
  currentDate: string;
}

export const GolfDataVisualizer: React.FC<GolfDataVisualizerProps> = ({ 
  currentData, 
  allLessons, 
  clientName, 
  clientPhone,
  currentClub,
  currentDate
}) => {
  
  // 1. Filter historical data for the same client and club
  const historyData = useMemo(() => {
    if (!currentClub) return [];

    const relevantLessons = allLessons.filter(
      l => l.clientName === clientName && 
           l.clientPhone === clientPhone && 
           l.club === currentClub &&
           l.golfData
    );

    // Sort by date ascending
    const sorted = relevantLessons.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Map to chart format
    return sorted.map(l => ({
      date: l.date.substring(5), // "MM-DD"
      fullDate: l.date,
      carry: l.golfData?.carryDistance || 0,
      total: l.golfData?.totalDistance || 0,
      ballSpeed: l.golfData?.ballSpeed || 0,
      headSpeed: l.golfData?.clubHeadSpeed || 0,
      smashFactor: l.golfData?.smashFactor || 0
    }));

  }, [allLessons, clientName, clientPhone, currentClub]);

  // Combine history with current if current is not already saved in history (preview mode)
  // or simple check if the last item is current. 
  // For simplicity in this view, we use historyData which acts as "All Records for this Club"
  const chartData = historyData.length > 0 ? historyData : [
      {
          date: 'Current',
          fullDate: currentDate,
          carry: currentData.carryDistance || 0,
          total: currentData.totalDistance || 0,
          ballSpeed: currentData.ballSpeed || 0,
          headSpeed: currentData.clubHeadSpeed || 0,
          smashFactor: currentData.smashFactor || 0
      }
  ];

  const renderMetricCard = (label: string, value: number | undefined, unit: string, color: string) => (
    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
      <span className="text-gray-500 text-xs font-medium uppercase mb-1">{label}</span>
      <div className={`text-2xl font-bold ${color}`}>
        {value !== undefined ? value : '-'} <span className="text-sm font-normal text-gray-400">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Current Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
             <h3 className="text-white font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> 
                {currentClub ? `${currentClub} 분석 데이터` : '샷 데이터 분석'}
             </h3>
             <span className="text-gray-400 text-xs">{currentDate}</span>
        </div>
        
        <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {renderMetricCard("비거리 (Total)", currentData.totalDistance, "m", "text-gray-900")}
                {renderMetricCard("캐리 (Carry)", currentData.carryDistance, "m", "text-blue-600")}
                {renderMetricCard("볼 스피드", currentData.ballSpeed, "m/s", "text-emerald-600")}
                {renderMetricCard("헤드 스피드", currentData.clubHeadSpeed, "m/s", "text-indigo-600")}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <div className="flex justify-between items-center p-3 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">발사각</span>
                    <span className="font-bold text-gray-800">{currentData.launchAngle || '-'}°</span>
                 </div>
                 <div className="flex justify-between items-center p-3 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">백스핀</span>
                    <span className="font-bold text-gray-800">{currentData.backSpin || '-'} rpm</span>
                 </div>
                 <div className="flex justify-between items-center p-3 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">사이드스핀</span>
                    <span className="font-bold text-gray-800">{currentData.sideSpin || '-'} rpm</span>
                 </div>
                 <div className="flex justify-between items-center p-3 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">정타율</span>
                    <span className="font-bold text-gray-800">{currentData.smashFactor || '-'}</span>
                 </div>
            </div>
        </div>
      </div>

      {/* Charts - Only show if we have history (more than 1 point) */}
      {historyData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Distance Chart */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                 <h4 className="font-bold text-gray-800 mb-6 border-l-4 border-blue-500 pl-3">비거리 변화 추이</h4>
                 <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#9ca3af" />
                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} stroke="#9ca3af" />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="total" name="총 거리" stroke="#111827" strokeWidth={2} dot={{r: 4}} activeDot={{r: 6}} />
                            <Line type="monotone" dataKey="carry" name="캐리" stroke="#3b82f6" strokeWidth={2} dot={{r: 4}} />
                        </LineChart>
                     </ResponsiveContainer>
                 </div>
             </div>

             {/* Speed Chart */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                 <h4 className="font-bold text-gray-800 mb-6 border-l-4 border-emerald-500 pl-3">스피드 & 정타율</h4>
                 <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#9ca3af" />
                            <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{fontSize: 12}} stroke="#9ca3af" />
                            <YAxis yAxisId="right" orientation="right" domain={[1.0, 1.6]} tick={{fontSize: 12}} stroke="#9ca3af" hide />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="ballSpeed" name="볼 스피드" stroke="#059669" strokeWidth={2} dot={{r: 4}} />
                            <Line yAxisId="left" type="monotone" dataKey="headSpeed" name="헤드 스피드" stroke="#6366f1" strokeWidth={2} dot={{r: 4}} />
                            {/* Smash Factor is usually small scale, maybe tooltip only or separate axis? Keeping simple for now */}
                        </LineChart>
                     </ResponsiveContainer>
                 </div>
             </div>
        </div>
      )}
    </div>
  );
};
