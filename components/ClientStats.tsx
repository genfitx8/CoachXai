
import React, { useState, useMemo, useEffect } from 'react';
import { Lesson } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, AreaChart, Area, BarChart, Bar, Cell } from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Target, Wind, Calendar, Trophy, Flag, Activity, LayoutDashboard, Crosshair, Filter, CalendarDays, RefreshCw, Percent, CircleDot, Mic, GitCompareArrows } from 'lucide-react';
import { Button } from './Button';
import { getTourAverageDistanceM, getTourLabel, TourGender } from '../constants/tourAverages';

interface ClientStatsProps {
  lessons: Lesson[];
  onBack: () => void;
}

const TOUR_GENDER_STORAGE_KEY = 'coachxai_stats_tour_gender';

type StatTab = 'SHOT' | 'SCORE';
type PeriodOption = '1M' | '3M' | '6M' | '1Y' | 'ALL';

// Helper to get local YYYY-MM-DD
const getLocalISODate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const ClientStats: React.FC<ClientStatsProps> = ({ lessons, onBack }) => {
  const [activeTab, setActiveTab] = useState<StatTab>('SHOT');
  const [selectedClub, setSelectedClub] = useState<string>('');

  // Tour Average Comparison (PGA for male, LPGA for female)
  const [tourGender, setTourGender] = useState<TourGender>(() => {
    const saved = localStorage.getItem(TOUR_GENDER_STORAGE_KEY);
    return saved === 'FEMALE' ? 'FEMALE' : 'MALE';
  });

  useEffect(() => {
    localStorage.setItem(TOUR_GENDER_STORAGE_KEY, tourGender);
  }, [tourGender]);

  // Date Range State
  const [period, setPeriod] = useState<PeriodOption>('3M'); // Default 3 Months
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Round Comparison State
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedRound1, setSelectedRound1] = useState<string | null>(null);
  const [selectedRound2, setSelectedRound2] = useState<string | null>(null);

  // Initialize dates
  useEffect(() => {
    handlePeriodChange('3M');
  }, []);

  const handlePeriodChange = (option: PeriodOption) => {
      setPeriod(option);
      const end = new Date();
      const start = new Date();
      
      switch(option) {
          case '1M': start.setMonth(end.getMonth() - 1); break;
          case '3M': start.setMonth(end.getMonth() - 3); break;
          case '6M': start.setMonth(end.getMonth() - 6); break;
          case '1Y': start.setFullYear(end.getFullYear() - 1); break;
          case 'ALL': start.setFullYear(end.getFullYear() - 10); break; // Sufficiently old
      }

      setStartDate(getLocalISODate(start));
      setEndDate(getLocalISODate(end));
  };

  // Filter lessons based on date range
  const filteredLessons = useMemo(() => {
      return lessons.filter(l => {
          return l.date >= startDate && l.date <= endDate;
      });
  }, [lessons, startDate, endDate]);

  // --- SHOT DATA LOGIC ---

  // Extract unique clubs that have golf data WITHIN the selected period
  const availableClubs = useMemo(() => {
    const clubs = new Set<string>();
    filteredLessons.forEach(l => {
      if (l.golfData && l.recordType !== 'SCORE') {
        clubs.add(l.club || '미지정');
      }
    });
    return Array.from(clubs).sort();
  }, [filteredLessons]);

  // Effect to set default club when data is loaded or filtered
  useEffect(() => {
    if (activeTab === 'SHOT') {
        if (availableClubs.length > 0) {
            // If currently selected club is not in the new list, select the first one
            if (!selectedClub || !availableClubs.includes(selectedClub)) {
                setSelectedClub(availableClubs[0]);
            }
        } else {
            setSelectedClub('');
        }
    }
  }, [availableClubs, selectedClub, activeTab]);

  const shotStatsData = useMemo(() => {
    if (!selectedClub) return [];

    return filteredLessons
      .filter(l => {
        const clubName = l.club || '미지정';
        return clubName === selectedClub && l.golfData && l.recordType !== 'SCORE';
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(l => ({
        id: l.id,
        date: l.date.substring(5), // MM-DD
        fullDate: l.date,
        carry: l.golfData?.carryDistance || 0,
        total: l.golfData?.totalDistance || 0,
        ballSpeed: l.golfData?.ballSpeed || 0,
        headSpeed: l.golfData?.clubHeadSpeed || 0,
        smashFactor: l.golfData?.smashFactor || 0,
        backSpin: l.golfData?.backSpin || 0,
        sideSpin: l.golfData?.sideSpin || 0 // Added Side Spin
      }));
  }, [filteredLessons, selectedClub]);

  const shotSummary = useMemo(() => {
    if (shotStatsData.length === 0) return null;

    const totalDistances = shotStatsData.map(d => d.total);
    const ballSpeeds = shotStatsData.map(d => d.ballSpeed);
    const smashFactors = shotStatsData.map(d => d.smashFactor);

    const avgTotal = Math.round(totalDistances.reduce((a, b) => a + b, 0) / shotStatsData.length);
    const maxTotal = Math.max(...totalDistances);
    const avgBallSpeed = (ballSpeeds.reduce((a, b) => a + b, 0) / shotStatsData.length).toFixed(1);
    const avgSmash = (smashFactors.reduce((a, b) => a + b, 0) / shotStatsData.length).toFixed(2);
    
    // Trend calculation (compare last 3 avg vs first 3 avg if enough data)
    let improvement = 0;
    if (shotStatsData.length >= 2) {
        const first = shotStatsData.slice(0, Math.ceil(shotStatsData.length/2));
        const last = shotStatsData.slice(Math.ceil(shotStatsData.length/2));
        const firstAvg = first.reduce((a,b) => a + b.total, 0) / first.length;
        const lastAvg = last.reduce((a,b) => a + b.total, 0) / last.length;
        improvement = Math.round(lastAvg - firstAvg);
    }

    return { avgTotal, maxTotal, avgBallSpeed, avgSmash, count: shotStatsData.length, improvement };
  }, [shotStatsData]);

  const tourAverageDistance = useMemo(() => {
    if (!selectedClub) return null;
    return getTourAverageDistanceM(selectedClub, tourGender);
  }, [selectedClub, tourGender]);

  const tourAverageDiff = useMemo(() => {
    if (!shotSummary || tourAverageDistance === null) return null;
    return shotSummary.avgTotal - tourAverageDistance;
  }, [shotSummary, tourAverageDistance]);


  // --- SCORE DATA LOGIC ---

  const scoreStatsData = useMemo(() => {
      return filteredLessons
        .filter(l => l.recordType === 'SCORE' && typeof l.score === 'number')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(l => ({
            id: l.id,
            date: l.date.substring(5), // MM-DD
            fullDate: l.date,
            score: l.score as number,
            title: l.title
        }));
  }, [filteredLessons]);

  const scoreSummary = useMemo(() => {
      if (scoreStatsData.length === 0) return null;
      
      // Basic Stats
      const scores = scoreStatsData.map(d => d.score);
      const bestScore = Math.min(...scores);
      const avgScore = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
      const totalRounds = scores.length;
      
      // Recent Stats
      const last5 = scores.slice(-5);
      const recentAvg = (last5.reduce((a,b) => a+b, 0) / last5.length).toFixed(1);
      const firstScore = scores[0];
      const lastScore = scores[scores.length - 1];
      const scoreChange = firstScore - lastScore;

      // --- Advanced Stats (Detailed Hole Data) ---
      let par3Total = 0, par3Count = 0;
      let par4Total = 0, par4Count = 0;
      let par5Total = 0, par5Count = 0;
      
      let girHits = 0, girTotal = 0;
      let parSaves = 0, missedGirTotal = 0;
      
      let totalPutts = 0, roundsWithPutts = 0;

      // --- Voice Analytics Stats ---
      let teeDistanceTotal = 0, teeDistanceCount = 0;
      let puttDistanceTotal = 0, puttDistanceCount = 0;
      let secondDistanceTotal = 0, secondDistanceCount = 0;

      filteredLessons.forEach(l => {
          if (l.recordType === 'SCORE' && l.scorecardDetail) {
              const holes = l.scorecardDetail.holes;
              
              // Only count rounds that have complete data for accuracy
              if (holes.length > 0) {
                  // Putts (if > 0)
                  if (l.scorecardDetail.totalPutts > 0) {
                      totalPutts += l.scorecardDetail.totalPutts;
                      roundsWithPutts++;
                  }

                  holes.forEach(h => {
                      // Par Averages
                      if (h.score > 0) {
                          if (h.par === 3) { par3Total += h.score; par3Count++; }
                          else if (h.par === 4) { par4Total += h.score; par4Count++; }
                          else if (h.par === 5) { par5Total += h.score; par5Count++; }
                      }

                      // GIR & Scrambling Logic
                      // GIR Estimation: Score - Putts <= Par - 2
                      if (h.score > 0 && h.putts >= 0) {
                          const shotsToGreen = h.score - h.putts;
                          const isGir = shotsToGreen <= (h.par - 2);
                          
                          girTotal++;
                          if (isGir) {
                              girHits++;
                          } else {
                              // Missed GIR -> Check Scrambling (Par Save)
                              missedGirTotal++;
                              if (h.score <= h.par) {
                                  parSaves++;
                              }
                          }
                      }

                      // Voice Metrics Aggregation
                      if (h.shotMetrics) {
                          if (h.shotMetrics.teeDistance) {
                              teeDistanceTotal += h.shotMetrics.teeDistance;
                              teeDistanceCount++;
                          }
                          if (h.shotMetrics.firstPuttDistance) {
                              puttDistanceTotal += h.shotMetrics.firstPuttDistance;
                              puttDistanceCount++;
                          }
                          if (h.shotMetrics.secondShotDistance) {
                              secondDistanceTotal += h.shotMetrics.secondShotDistance;
                              secondDistanceCount++;
                          }
                      }
                  });
              }
          }
      });

      const avgPar3 = par3Count > 0 ? (par3Total / par3Count).toFixed(1) : '-';
      const avgPar4 = par4Count > 0 ? (par4Total / par4Count).toFixed(1) : '-';
      const avgPar5 = par5Count > 0 ? (par5Total / par5Count).toFixed(1) : '-';
      
      const girRate = girTotal > 0 ? Math.round((girHits / girTotal) * 100) : null;
      const scramblingRate = missedGirTotal > 0 ? Math.round((parSaves / missedGirTotal) * 100) : null;
      const avgPutts = roundsWithPutts > 0 ? (totalPutts / roundsWithPutts).toFixed(1) : null;

      // Voice Metrics Averages
      const avgTeeDistance = teeDistanceCount > 0 ? Math.round(teeDistanceTotal / teeDistanceCount) : null;
      const avgPuttDistance = puttDistanceCount > 0 ? (puttDistanceTotal / puttDistanceCount).toFixed(1) : null;
      const avgSecondDistance = secondDistanceCount > 0 ? Math.round(secondDistanceTotal / secondDistanceCount) : null;

      return { 
          bestScore, avgScore, totalRounds, recentAvg, scoreChange,
          avgPar3, avgPar4, avgPar5, girRate, scramblingRate, avgPutts,
          avgTeeDistance, avgPuttDistance, avgSecondDistance,
          hasDetailedStats: par3Count > 0,
          hasVoiceStats: teeDistanceCount > 0
      };
  }, [scoreStatsData, filteredLessons]);

  // --- ROUND COMPARISON LOGIC ---
  
  // Calculate detailed stats for a single round
  const calculateRoundStats = (lesson: Lesson) => {
    if (!lesson.scorecardDetail) return null;
    
    const holes = lesson.scorecardDetail.holes;
    
    // GIR calculation
    let girHits = 0, girTotal = 0;
    let parSaves = 0, missedGirTotal = 0;
    
    // Par averages
    let par3Total = 0, par3Count = 0;
    let par4Total = 0, par4Count = 0;
    let par5Total = 0, par5Count = 0;
    
    // Voice Metrics
    let teeDistanceTotal = 0, teeDistanceCount = 0;
    let puttDistanceTotal = 0, puttDistanceCount = 0;
    let secondDistanceTotal = 0, secondDistanceCount = 0;
    
    holes.forEach(h => {
      // GIR & Scrambling
      if (h.score > 0 && h.putts >= 0) {
        const shotsToGreen = h.score - h.putts;
        const isGir = shotsToGreen <= (h.par - 2);
        
        girTotal++;
        if (isGir) {
          girHits++;
        } else {
          missedGirTotal++;
          if (h.score <= h.par) parSaves++;
        }
      }
      
      // Par Averages
      if (h.score > 0) {
        if (h.par === 3) { par3Total += h.score; par3Count++; }
        else if (h.par === 4) { par4Total += h.score; par4Count++; }
        else if (h.par === 5) { par5Total += h.score; par5Count++; }
      }
      
      // Shot Metrics
      if (h.shotMetrics) {
        if (h.shotMetrics.teeDistance) {
          teeDistanceTotal += h.shotMetrics.teeDistance;
          teeDistanceCount++;
        }
        if (h.shotMetrics.firstPuttDistance) {
          puttDistanceTotal += h.shotMetrics.firstPuttDistance;
          puttDistanceCount++;
        }
        if (h.shotMetrics.secondShotDistance) {
          secondDistanceTotal += h.shotMetrics.secondShotDistance;
          secondDistanceCount++;
        }
      }
    });
    
    return {
      totalScore: lesson.scorecardDetail.totalScore,
      totalPutts: lesson.scorecardDetail.totalPutts,
      girRate: girTotal > 0 ? Math.round((girHits / girTotal) * 100) : null,
      scramblingRate: missedGirTotal > 0 ? Math.round((parSaves / missedGirTotal) * 100) : null,
      avgPar3: par3Count > 0 ? (par3Total / par3Count).toFixed(1) : null,
      avgPar4: par4Count > 0 ? (par4Total / par4Count).toFixed(1) : null,
      avgPar5: par5Count > 0 ? (par5Total / par5Count).toFixed(1) : null,
      avgTeeDistance: teeDistanceCount > 0 ? Math.round(teeDistanceTotal / teeDistanceCount) : null,
      avgPuttDistance: puttDistanceCount > 0 ? (puttDistanceTotal / puttDistanceCount).toFixed(1) : null,
      avgSecondDistance: secondDistanceCount > 0 ? Math.round(secondDistanceTotal / secondDistanceCount) : null,
      holes: holes,
    };
  };
  
  // Get rounds with detailed scorecard data for comparison
  const roundsForComparison = useMemo(() => {
    return filteredLessons
      .filter(l => l.recordType === 'SCORE' && l.scorecardDetail)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredLessons]);
  
  // Initialize default selections
  useEffect(() => {
    if (isComparisonMode && roundsForComparison.length >= 2) {
      if (!selectedRound1) {
        setSelectedRound1(roundsForComparison[roundsForComparison.length - 1].id);
      }
      if (!selectedRound2) {
        setSelectedRound2(roundsForComparison[0].id);
      }
    }
  }, [isComparisonMode, roundsForComparison, selectedRound1, selectedRound2]);
  
  // Get comparison data
  const comparisonData = useMemo(() => {
    if (!selectedRound1 || !selectedRound2) return null;
    
    const round1 = roundsForComparison.find(r => r.id === selectedRound1);
    const round2 = roundsForComparison.find(r => r.id === selectedRound2);
    
    if (!round1 || !round2) return null;
    
    const stats1 = calculateRoundStats(round1);
    const stats2 = calculateRoundStats(round2);
    
    if (!stats1 || !stats2) return null;
    
    return {
      round1: { lesson: round1, stats: stats1 },
      round2: { lesson: round2, stats: stats2 }
    };
  }, [selectedRound1, selectedRound2, roundsForComparison]);


  return (
    <div className="space-y-4 animate-fade-in pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0 hover:bg-transparent">
             <ArrowLeft className="w-5 h-5 mr-1" /> 목록
        </Button>
        <h2 className="text-lg font-bold text-gray-900">분석 리포트</h2>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-emerald-600" /> 분석 기간 설정
              </h3>
              <span className="text-xs text-gray-500 font-mono">
                  {startDate} ~ {endDate}
              </span>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {(['1M', '3M', '6M', '1Y', 'ALL'] as PeriodOption[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handlePeriodChange(opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                        period === opt 
                        ? 'bg-gray-800 text-white' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                      {opt === '1M' ? '1개월' : opt === '3M' ? '3개월' : opt === '6M' ? '6개월' : opt === '1Y' ? '1년' : '전체'}
                  </button>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div className="relative">
                  <span className="absolute left-2 top-2 text-[10px] text-gray-400">시작일</span>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPeriod('ALL'); }}
                    className="w-full pl-2 pt-5 pb-1 text-xs font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                  />
              </div>
              <div className="relative">
                   <span className="absolute left-2 top-2 text-[10px] text-gray-400">종료일</span>
                   <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPeriod('ALL'); }}
                    className="w-full pl-2 pt-5 pb-1 text-xs font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
                  />
              </div>
          </div>
      </div>

      {/* Tab Switcher */}
      <div className="bg-gray-100 p-1 rounded-xl flex items-center">
          <button 
            onClick={() => setActiveTab('SHOT')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'SHOT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
              <Crosshair className="w-4 h-4" /> 샷 데이터
          </button>
          <button 
            onClick={() => setActiveTab('SCORE')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'SCORE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
              <Trophy className="w-4 h-4" /> 라운드
          </button>
      </div>

      {/* ... (SHOT DATA VIEW and SCORE DATA VIEW remain same) ... */}
      {activeTab === 'SHOT' && (
        <div className="space-y-6 animate-fade-in">
            {/* Club Selector */}
            {availableClubs.length > 0 ? (
                <>
                    <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                        <div className="flex gap-2">
                            {availableClubs.map(club => (
                                <button
                                    key={club}
                                    onClick={() => setSelectedClub(club)}
                                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                                        selectedClub === club 
                                        ? 'bg-emerald-800 text-white border-emerald-600 shadow-md' 
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {club}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tour Average Comparison Gender Toggle */}
                    <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs font-bold text-gray-500">투어 평균 비교 기준</span>
                        <div className="flex bg-gray-100 p-1 rounded-full">
                            <button
                                onClick={() => setTourGender('MALE')}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                                    tourGender === 'MALE' ? 'bg-emerald-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                남성 (PGA)
                            </button>
                            <button
                                onClick={() => setTourGender('FEMALE')}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                                    tourGender === 'FEMALE' ? 'bg-pink-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                여성 (LPGA)
                            </button>
                        </div>
                    </div>

                    {shotSummary && (
                        <div className="space-y-4">
                            {/* Report Header Card */}
                            <div className="bg-white rounded-xl shadow-lg border border-emerald-100/50 overflow-hidden">
                                <div className="bg-gradient-to-r from-emerald-700 to-emerald-800 px-4 py-3 border-b border-emerald-600 flex justify-between items-center">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                        <Activity className="w-4 h-4" /> 샷 퍼포먼스 리포트
                                    </h3>
                                    <span className="text-[10px] bg-white/90 backdrop-blur-sm text-emerald-700 px-2.5 py-1 rounded-full border border-white/20 font-bold shadow-sm">
                                        {selectedClub}
                                    </span>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-4">
                                    <div className="text-center p-2">
                                        <p className="text-xs text-gray-500 mb-1">데이터 수</p>
                                        <p className="text-xl font-bold text-gray-900">{shotSummary.count}회</p>
                                    </div>
                                    <div className="text-center p-2 border-l border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">거리 향상</p>
                                        <p className={`text-xl font-bold ${shotSummary.improvement > 0 ? 'text-red-500' : 'text-gray-700'}`}>
                                            {shotSummary.improvement > 0 ? `+${shotSummary.improvement}m` : `${shotSummary.improvement}m`}
                                        </p>
                                    </div>
                                    <div className="col-span-2 grid grid-cols-2 gap-3 mt-2">
                                        <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 rounded-xl p-4 text-white shadow-xl shadow-emerald-900/15 hover:shadow-2xl hover:shadow-emerald-700/50 transition-all duration-300 transform hover:-translate-y-1">
                                            <div className="flex items-center gap-1 opacity-90 mb-1 text-xs font-semibold">
                                                <Target className="w-3 h-3" /> 평균 비거리
                                            </div>
                                            <div className="text-2xl font-bold">{shotSummary.avgTotal}m</div>
                                            <div className="text-xs opacity-90 mt-1 font-medium">최대 {shotSummary.maxTotal}m</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 rounded-xl p-4 text-white shadow-xl shadow-slate-900/15 hover:shadow-2xl hover:shadow-slate-900/20 transition-all duration-300 transform hover:-translate-y-1">
                                            <div className="flex items-center gap-1 opacity-90 mb-1 text-xs font-semibold">
                                                <Wind className="w-3 h-3" /> 평균 볼 스피드
                                            </div>
                                            <div className="text-2xl font-bold">{shotSummary.avgBallSpeed}m/s</div>
                                            <div className="text-xs opacity-90 mt-1 font-medium">정타율 {shotSummary.avgSmash}</div>
                                        </div>
                                    </div>

                                    {tourAverageDistance !== null && (
                                        <div className={`col-span-2 rounded-xl p-3 border mt-1 ${tourGender === 'MALE' ? 'bg-blue-50 border-blue-100' : 'bg-pink-50 border-pink-100'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs font-bold flex items-center gap-1 ${tourGender === 'MALE' ? 'text-blue-700' : 'text-pink-700'}`}>
                                                    <Trophy className="w-3.5 h-3.5" /> {getTourLabel(tourGender)} 평균 비거리
                                                </span>
                                                <span className={`text-sm font-bold ${tourGender === 'MALE' ? 'text-blue-900' : 'text-pink-900'}`}>{tourAverageDistance}m</span>
                                            </div>
                                            {tourAverageDiff !== null && (
                                                <div className="flex items-center justify-end gap-1 mt-1 text-xs">
                                                    <span className="text-gray-500">내 평균 대비</span>
                                                    <span className={`flex items-center gap-0.5 font-bold ${tourAverageDiff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                        {tourAverageDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {tourAverageDiff >= 0 ? `+${tourAverageDiff}` : tourAverageDiff}m
                                                    </span>
                                                </div>
                                            )}
                                            <p className="text-[10px] text-gray-400 mt-1">* 공개된 투어 통계 기반 참고용 평균치입니다.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Charts */}
                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-md hover:shadow-lg transition-shadow">
                                <h3 className="font-bold text-gray-900 mb-4 text-sm flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-gradient-to-b from-emerald-700 to-emerald-800 rounded-full shadow-sm"></span>
                                    비거리 변화 (Total & Carry)
                                </h3>
                                <div className="h-56 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={shotStatsData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#9ca3af" interval="preserveStartEnd" />
                                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} stroke="#9ca3af" />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                                            />
                                            <Legend
                                                wrapperStyle={{fontSize: '11px'}}
                                                payload={[
                                                    { value: 'Total', type: 'line', color: '#059669' },
                                                    { value: 'Carry', type: 'line', color: '#3b82f6' },
                                                    ...(tourAverageDistance !== null ? [{ value: `${getTourLabel(tourGender)} 평균 (${tourAverageDistance}m)`, type: 'line' as const, color: tourGender === 'MALE' ? '#2563eb' : '#db2777' }] : []),
                                                ]}
                                            />
                                            {tourAverageDistance !== null && (
                                                <ReferenceLine
                                                    y={tourAverageDistance}
                                                    stroke={tourGender === 'MALE' ? '#2563eb' : '#db2777'}
                                                    strokeWidth={2}
                                                    strokeDasharray="5 3"
                                                    ifOverflow="extendDomain"
                                                    label={{ value: `${getTourLabel(tourGender)} 평균 ${tourAverageDistance}m`, fill: tourGender === 'MALE' ? '#2563eb' : '#db2777', fontSize: 10, position: 'insideBottomLeft' }}
                                                />
                                            )}
                                            <Line type="monotone" dataKey="total" name="Total" stroke="#059669" strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} />
                                            <Line type="monotone" dataKey="carry" name="Carry" stroke="#3b82f6" strokeWidth={2} dot={{r: 3}} />
                                        </LineChart>
                                        </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-md hover:shadow-lg transition-shadow">
                                <h3 className="font-bold text-gray-900 mb-4 text-sm flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-gradient-to-b from-slate-600 to-slate-700 rounded-full shadow-sm"></span>
                                    스피드 변화 (Ball & Head)
                                </h3>
                                <div className="h-56 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={shotStatsData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#9ca3af" interval="preserveStartEnd" />
                                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} stroke="#9ca3af" />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                                            />
                                            <Legend wrapperStyle={{fontSize: '11px'}} />
                                            <Line type="monotone" dataKey="ballSpeed" name="Ball Speed" stroke="#6366f1" strokeWidth={2} dot={{r: 3}} />
                                            <Line type="monotone" dataKey="headSpeed" name="Head Speed" stroke="#ec4899" strokeWidth={2} dot={{r: 3}} />
                                        </LineChart>
                                        </ResponsiveContainer>
                                </div>
                            </div>

                             {/* Directionality Chart (Side Spin) */}
                             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-md hover:shadow-lg transition-shadow">
                                <h3 className="font-bold text-gray-900 mb-4 text-sm flex items-center gap-2">
                                    <span className="w-1.5 h-5 bg-gradient-to-b from-orange-500 to-orange-600 rounded-full shadow-sm"></span>
                                    방향성 (Side Spin)
                                </h3>
                                <div className="h-56 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={shotStatsData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#9ca3af" interval="preserveStartEnd" />
                                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} stroke="#9ca3af" />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                                                formatter={(value: number) => [
                                                    `${value > 0 ? 'R' : value < 0 ? 'L' : ''} ${Math.abs(value)} rpm`,
                                                    'Side Spin'
                                                ]}
                                            />
                                            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                                            <Legend wrapperStyle={{fontSize: '11px'}} />
                                            <Bar dataKey="sideSpin" name="Side Spin (L/R)" fill="#f97316" radius={[2, 2, 0, 0]}>
                                                {shotStatsData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.sideSpin > 0 ? '#3b82f6' : entry.sideSpin < 0 ? '#ef4444' : '#9ca3af'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> 우측(Slice/Fade)</div>
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div> 좌측(Hook/Draw)</div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="bg-white rounded-xl p-8 text-center border border-gray-200 shadow-sm mt-4">
                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">해당 기간 데이터 없음</h3>
                    <p className="text-gray-500 text-sm mt-2">
                        선택하신 기간 동안의 샷 데이터가 없습니다.<br/>
                        기간을 변경하거나 데이터를 추가해주세요.
                    </p>
                </div>
            )}
        </div>
      )}

      {/* --- SCORE DATA VIEW --- */}
      {activeTab === 'SCORE' && (
          <div className="space-y-6 animate-fade-in">
              {scoreStatsData.length > 0 && scoreSummary ? (
                  <>
                    {/* Report Header Card */}
                    <div className="bg-white rounded-xl shadow-lg border border-blue-100/50 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 border-b border-blue-600 flex justify-between items-center">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                <Activity className="w-4 h-4" /> 라운드 퍼포먼스 리포트
                            </h3>
                            <span className="text-[10px] bg-white/90 backdrop-blur-sm text-blue-700 px-2.5 py-1 rounded-full border border-white/20 font-bold shadow-sm">
                                Total {scoreSummary.totalRounds} Games
                            </span>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                                    <span className="text-xs text-gray-500 font-bold mb-1">평균 스코어</span>
                                    <div className="text-2xl font-black text-gray-900">{scoreSummary.avgScore} <span className="text-xs font-normal text-gray-400">타</span></div>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                                    <span className="text-xs text-gray-500 font-bold mb-1">기간 내 라베</span>
                                    <div className="text-2xl font-black text-blue-600">{scoreSummary.bestScore} <span className="text-xs font-normal text-gray-400">타</span></div>
                                </div>
                            </div>
                            
                            {/* Advanced Metrics (Only if detailed data exists) */}
                            {scoreSummary.hasDetailedStats && (
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    <div className="bg-gray-50 p-2 rounded-lg text-center">
                                        <span className="text-[10px] text-gray-500 block mb-1">Par 3 평균</span>
                                        <span className="text-sm font-bold text-gray-800">{scoreSummary.avgPar3}</span>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded-lg text-center">
                                        <span className="text-[10px] text-gray-500 block mb-1">Par 4 평균</span>
                                        <span className="text-sm font-bold text-gray-800">{scoreSummary.avgPar4}</span>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded-lg text-center">
                                        <span className="text-[10px] text-gray-500 block mb-1">Par 5 평균</span>
                                        <span className="text-sm font-bold text-gray-800">{scoreSummary.avgPar5}</span>
                                    </div>
                                    
                                    <div className="bg-emerald-50 p-2 rounded-lg text-center border border-emerald-100">
                                        <span className="text-[10px] text-emerald-700 block mb-1 flex items-center justify-center gap-1"><CircleDot className="w-3 h-3"/> 파온율(GIR)</span>
                                        <span className="text-sm font-bold text-emerald-800">{scoreSummary.girRate !== null ? `${scoreSummary.girRate}%` : '-'}</span>
                                    </div>
                                    <div className="bg-orange-50 p-2 rounded-lg text-center border border-orange-100">
                                        <span className="text-[10px] text-orange-700 block mb-1 flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3"/> 파세이브율</span>
                                        <span className="text-sm font-bold text-orange-800">{scoreSummary.scramblingRate !== null ? `${scoreSummary.scramblingRate}%` : '-'}</span>
                                    </div>
                                    <div className="bg-indigo-50 p-2 rounded-lg text-center border border-indigo-100">
                                        <span className="text-[10px] text-indigo-700 block mb-1 flex items-center justify-center gap-1"><Target className="w-3 h-3"/> 평균 퍼팅</span>
                                        <span className="text-sm font-bold text-indigo-800">{scoreSummary.avgPutts !== null ? `${scoreSummary.avgPutts}개` : '-'}</span>
                                    </div>
                                </div>
                            )}

                            {/* AI Voice Metrics Analysis (New Section) */}
                            {scoreSummary.hasVoiceStats && (
                                <div className="mb-4 pt-3 border-t border-gray-100 animate-fade-in">
                                    <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
                                        <Mic className="w-3 h-3" /> 정밀 샷 분석 (AI Voice)
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-blue-50 p-2 rounded-lg text-center border border-blue-100">
                                            <span className="text-[10px] text-blue-700 block mb-1">Avg 드라이버</span>
                                            <span className="text-sm font-bold text-blue-900">{scoreSummary.avgTeeDistance || '-'}m</span>
                                        </div>
                                        <div className="bg-indigo-50 p-2 rounded-lg text-center border border-indigo-100">
                                            <span className="text-[10px] text-indigo-700 block mb-1">Avg 세컨 남은거리</span>
                                            <span className="text-sm font-bold text-indigo-900">{scoreSummary.avgSecondDistance || '-'}m</span>
                                        </div>
                                        <div className="bg-emerald-50 p-2 rounded-lg text-center border border-emerald-100">
                                            <span className="text-[10px] text-emerald-700 block mb-1">Avg 퍼팅 거리</span>
                                            <span className="text-sm font-bold text-emerald-900">{scoreSummary.avgPuttDistance || '-'}m</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 text-center text-xs text-gray-500 divide-x divide-gray-100 pt-2 border-t border-gray-100">
                                <div>
                                    <p className="mb-1">최근 5경기 평균</p>
                                    <p className="font-bold text-gray-900 text-sm">{scoreSummary.recentAvg}타</p>
                                </div>
                                <div>
                                    <p className="mb-1">기간 스코어 변화</p>
                                    <p className={`font-bold text-sm ${scoreSummary.scoreChange > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                        {scoreSummary.scoreChange > 0 ? `${scoreSummary.scoreChange}타 줄임` : '변화 없음/증가'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-md hover:shadow-lg transition-shadow">
                        <h3 className="font-bold text-gray-900 mb-4 text-sm flex items-center gap-2">
                            <span className="w-1.5 h-5 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full shadow-sm"></span>
                            라운드 스코어 변화 추이
                        </h3>
                        <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={scoreStatsData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#9ca3af" />
                                    <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} stroke="#9ca3af" reversed />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                                    />
                                    <ReferenceLine y={72} stroke="green" strokeDasharray="3 3" label={{ value: "Par 72", fill: "green", fontSize: 10, position: 'right' }} />
                                    <ReferenceLine y={scoreSummary.avgScore} stroke="orange" strokeDasharray="3 3" label={{ value: "Avg", fill: "orange", fontSize: 10, position: 'insideTopLeft' }} />
                                    <Line type="monotone" dataKey="score" name="타수" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff'}} />
                                </LineChart>
                                </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Round Comparison Section */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-md hover:shadow-lg transition-shadow">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                <span className="w-1.5 h-5 bg-gradient-to-b from-slate-600 to-slate-700 rounded-full shadow-sm"></span>
                                라운드 비교 분석
                            </h3>
                            <button
                                onClick={() => setIsComparisonMode(!isComparisonMode)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                                    isComparisonMode 
                                    ? 'bg-slate-700 text-white shadow-md' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                <GitCompareArrows className="w-3 h-3" />
                                {isComparisonMode ? '비교 모드 ON' : '비교 모드 OFF'}
                            </button>
                        </div>

                        {isComparisonMode && (
                            <>
                                {roundsForComparison.length < 2 ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500 text-sm">비교할 라운드가 부족합니다.</p>
                                        <p className="text-gray-400 text-xs mt-1">최소 2개 이상의 라운드가 필요합니다.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Round Selectors */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs text-gray-500 font-bold mb-1.5 block">Round 1</label>
                                                <select
                                                    value={selectedRound1 || ''}
                                                    onChange={(e) => setSelectedRound1(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                >
                                                    {roundsForComparison.map(round => (
                                                        <option key={round.id} value={round.id} disabled={round.id === selectedRound2}>
                                                            {round.date} - {round.title} ({round.score}타)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 font-bold mb-1.5 block">Round 2</label>
                                                <select
                                                    value={selectedRound2 || ''}
                                                    onChange={(e) => setSelectedRound2(e.target.value)}
                                                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                >
                                                    {roundsForComparison.map(round => (
                                                        <option key={round.id} value={round.id} disabled={round.id === selectedRound1}>
                                                            {round.date} - {round.title} ({round.score}타)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Comparison Stats Card */}
                                        {comparisonData && (
                                            <>
                                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-indigo-100">
                                                    <h4 className="font-bold text-sm text-indigo-800 mb-3 flex items-center gap-2">
                                                        📊 경기력 비교 분석
                                                    </h4>
                                                    
                                                    {/* Round Info */}
                                                    <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                                        <div className="bg-white rounded-lg p-2 shadow-sm">
                                                            <span className="text-gray-500 block mb-1">Round 1</span>
                                                            <span className="font-bold text-gray-900">{comparisonData.round1.lesson.date} - {comparisonData.round1.lesson.title}</span>
                                                            <span className="text-blue-600 font-bold ml-1">({comparisonData.round1.stats.totalScore}타)</span>
                                                        </div>
                                                        <div className="bg-white rounded-lg p-2 shadow-sm">
                                                            <span className="text-gray-500 block mb-1">Round 2</span>
                                                            <span className="font-bold text-gray-900">{comparisonData.round2.lesson.date} - {comparisonData.round2.lesson.title}</span>
                                                            <span className="text-blue-600 font-bold ml-1">({comparisonData.round2.stats.totalScore}타)</span>
                                                        </div>
                                                    </div>

                                                    {/* Comparison Metrics */}
                                                    <div className="space-y-2">
                                                        {(() => {
                                                            const renderComparisonRow = (
                                                                label: string, 
                                                                value1: number | string | null, 
                                                                value2: number | string | null, 
                                                                unit: string,
                                                                lowerIsBetter: boolean = true
                                                            ) => {
                                                                if (value1 === null || value2 === null) return null;
                                                                
                                                                const num1 = typeof value1 === 'string' ? parseFloat(value1) : value1;
                                                                const num2 = typeof value2 === 'string' ? parseFloat(value2) : value2;
                                                                const diff = num2 - num1;
                                                                const isImprovement = lowerIsBetter ? diff < 0 : diff > 0;
                                                                const isEqual = Math.abs(diff) < 0.01;
                                                                
                                                                // Format difference based on unit type
                                                                const diffDisplay = unit === '%' ? diff.toFixed(1) : (lowerIsBetter ? diff.toFixed(1) : diff.toFixed(0));
                                                                
                                                                return (
                                                                    <div key={label} className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                                                                        isEqual ? 'bg-gray-50' : isImprovement ? 'bg-emerald-50' : 'bg-red-50'
                                                                    }`}>
                                                                        <span className="font-bold text-gray-700">{label}</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-gray-600">{value1}{unit}</span>
                                                                            <span className="text-gray-400">→</span>
                                                                            <span className="text-gray-900 font-bold">{value2}{unit}</span>
                                                                            {!isEqual && (
                                                                                <span className={`flex items-center gap-0.5 font-bold ${
                                                                                    isImprovement ? 'text-emerald-700' : 'text-red-700'
                                                                                }`}>
                                                                                    {isImprovement ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                                                    {diff > 0 ? '+' : ''}{diffDisplay}{unit}
                                                                                </span>
                                                                            )}
                                                                            {isEqual && <Minus className="w-3 h-3 text-gray-400" />}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            };
                                                            
                                                            return (
                                                                <>
                                                                    {renderComparisonRow('총 스코어', comparisonData.round1.stats.totalScore, comparisonData.round2.stats.totalScore, '타', true)}
                                                                    {renderComparisonRow('총 퍼팅', comparisonData.round1.stats.totalPutts, comparisonData.round2.stats.totalPutts, '개', true)}
                                                                    {renderComparisonRow('GIR (파온율)', comparisonData.round1.stats.girRate, comparisonData.round2.stats.girRate, '%', false)}
                                                                    {renderComparisonRow('파세이브율', comparisonData.round1.stats.scramblingRate, comparisonData.round2.stats.scramblingRate, '%', false)}
                                                                    {renderComparisonRow('Par 3 평균', comparisonData.round1.stats.avgPar3, comparisonData.round2.stats.avgPar3, '타', true)}
                                                                    {renderComparisonRow('Par 4 평균', comparisonData.round1.stats.avgPar4, comparisonData.round2.stats.avgPar4, '타', true)}
                                                                    {renderComparisonRow('Par 5 평균', comparisonData.round1.stats.avgPar5, comparisonData.round2.stats.avgPar5, '타', true)}
                                                                    {renderComparisonRow('평균 티샷', comparisonData.round1.stats.avgTeeDistance, comparisonData.round2.stats.avgTeeDistance, 'm', false)}
                                                                    {renderComparisonRow('평균 퍼팅거리', comparisonData.round1.stats.avgPuttDistance, comparisonData.round2.stats.avgPuttDistance, 'm', true)}
                                                                    {renderComparisonRow('평균 세컨샷', comparisonData.round1.stats.avgSecondDistance, comparisonData.round2.stats.avgSecondDistance, 'm', true)}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* Hole-by-Hole Comparison Chart */}
                                                <div className="bg-white rounded-xl border border-gray-100 p-4">
                                                    <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                                                        <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                                                        홀별 스코어 비교
                                                    </h4>
                                                    <div className="h-80 w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart 
                                                                data={comparisonData.round1.stats.holes.map((hole) => {
                                                                    const round2Hole = comparisonData.round2.stats.holes.find(h => h.holeNumber === hole.holeNumber);
                                                                    return {
                                                                        hole: hole.holeNumber,
                                                                        par: hole.par,
                                                                        round1: hole.score || 0,
                                                                        round2: round2Hole?.score || 0,
                                                                        putts1: hole.putts || 0,
                                                                        putts2: round2Hole?.putts || 0,
                                                                    };
                                                                })}
                                                                margin={{ top: 5, right: 10, bottom: 5, left: -20 }}
                                                            >
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                                <XAxis dataKey="hole" tick={{fontSize: 10}} stroke="#9ca3af" label={{ value: 'Hole', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                                                                <YAxis tick={{fontSize: 10}} stroke="#9ca3af" />
                                                                <Tooltip 
                                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '11px' }}
                                                                    formatter={(value: any, name: string, props: any) => {
                                                                        if (name === 'round1') return [value, `Round 1 (${props.payload.putts1}퍼팅)`];
                                                                        if (name === 'round2') return [value, `Round 2 (${props.payload.putts2}퍼팅)`];
                                                                        return [value, name];
                                                                    }}
                                                                    labelFormatter={(label) => `Hole ${label}`}
                                                                />
                                                                <Legend wrapperStyle={{fontSize: '11px'}} />
                                                                <Bar dataKey="round1" name="Round 1" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                                <Bar dataKey="round2" name="Round 2" fill="#10b981" radius={[4, 4, 0, 0]} />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                    <div className="flex justify-center gap-4 mt-3 text-xs text-gray-500">
                                                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded"></div> Round 1</div>
                                                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-700 rounded"></div> Round 2</div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-sm text-gray-700">
                            라운드 기록 일지
                        </div>
                        <div className="divide-y divide-gray-100">
                            {[...scoreStatsData].reverse().map((item) => (
                                <div key={item.id} className="flex justify-between items-center px-4 py-3 text-sm hover:bg-gray-50 transition-colors">
                                    <div>
                                        <p className="font-bold text-gray-900 truncate max-w-[180px]">{item.title}</p>
                                        <div className="text-gray-500 text-xs flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-3 h-3 text-gray-400" />
                                            {item.fullDate}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-lg font-bold ${item.score <= 72 ? 'text-red-500' : 'text-gray-900'}`}>{item.score}</span>
                                        <span className="text-xs text-gray-400 ml-0.5">타</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                  </>
              ) : (
                  <div className="bg-white rounded-xl p-8 text-center border border-gray-200 shadow-sm mt-4">
                    <Flag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900">해당 기간 기록 없음</h3>
                    <p className="text-gray-500 text-sm mt-2">
                        선택하신 기간 내의 라운드 기록이 없습니다.<br/>
                        기간을 변경하거나 라운드 기록을 추가해주세요.
                    </p>
                </div>
              )}
          </div>
      )}
    </div>
  );
};
