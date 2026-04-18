
import React, { useState, useEffect, useMemo } from 'react';
import { Homework, HomeworkTemplate } from '../types';
import { Button } from './Button';
import { X, ListChecks, Calendar as CalendarIcon, Repeat, Trash2, CheckSquare, Square, CheckCircle2, ArrowLeft } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

interface HomeworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string; // Composite "Name_Phone"
  clientName: string;
  isFirebaseMode: boolean;
  onAssign: () => void;
}

const WEEK_DAYS = [
    { label: '일', value: 0 },
    { label: '월', value: 1 },
    { label: '화', value: 2 },
    { label: '수', value: 3 },
    { label: '목', value: 4 },
    { label: '금', value: 5 },
    { label: '토', value: 6 },
];

const DURATION_OPTIONS = [
    { label: '1주 (7일)', value: 1 },
    { label: '2주 (14일)', value: 2 },
    { label: '4주 (1개월)', value: 4 },
    { label: '8주 (2개월)', value: 8 },
    { label: '12주 (3개월)', value: 12 },
];

export const HomeworkModal: React.FC<HomeworkModalProps> = ({ isOpen, onClose, clientId, clientName, isFirebaseMode, onAssign }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'ASSIGN'>('LIST');
  
  // Initialize with local date string
  const [taskTitle, setTaskTitle] = useState('');
  const [startDate, setStartDate] = useState(() => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  });
  const [durationWeeks, setDurationWeeks] = useState<number>(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Default Mon, Wed, Fri
  
  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [recentHomework, setRecentHomework] = useState<Homework[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
        loadData();
    }
  }, [isOpen, clientId]);

  const loadData = async () => {
    setIsLoading(true);
    let tmpls: HomeworkTemplate[] = [];
    let hw: Homework[] = [];

    if (isFirebaseMode) {
        tmpls = await firebaseService.getHomeworkTemplates();
        hw = await firebaseService.getHomework(clientId);
    } else {
        tmpls = storageService.getHomeworkTemplates();
        const allHw = storageService.getHomework();
        hw = allHw.filter(h => h.clientId === clientId);
    }
    
    setTemplates(tmpls);
    setRecentHomework(hw.sort((a,b) => b.createdAt - a.createdAt));
    setIsLoading(false);
  };

  // Stats Calculation
  const stats = useMemo(() => {
      const total = recentHomework.length;
      if (total === 0) return { total: 0, completed: 0, rate: 0 };
      const completed = recentHomework.filter(h => h.isCompleted).length;
      const rate = Math.round((completed / total) * 100);
      return { total, completed, rate };
  }, [recentHomework]);

  const toggleDay = (dayValue: number) => {
      setSelectedDays(prev => 
          prev.includes(dayValue) 
          ? prev.filter(d => d !== dayValue) 
          : [...prev, dayValue].sort()
      );
  };

  const calculateTotalTasks = () => {
      return generateHomeworkBatch().length;
  };

  const generateHomeworkBatch = (): Homework[] => {
      const batch: Homework[] = [];
      
      // Explicitly parse YYYY-MM-DD components to avoid timezone shifts
      const [y, m, d] = startDate.split('-').map(Number);
      
      // Create a date at noon local time to avoid DST/timezone shifting when adding hours or crossing midnight
      const cursor = new Date(y, m - 1, d, 12, 0, 0);
      
      const totalDays = durationWeeks * 7;

      for (let i = 0; i < totalDays; i++) {
          // Check day of week (0-6)
          const currentDayOfWeek = cursor.getDay();
          
          if (selectedDays.includes(currentDayOfWeek)) {
              // Format back to YYYY-MM-DD manually using local time getters
              const cy = cursor.getFullYear();
              const cm = String(cursor.getMonth() + 1).padStart(2, '0');
              const cd = String(cursor.getDate()).padStart(2, '0');
              const dateStr = `${cy}-${cm}-${cd}`;

              batch.push({
                  id: crypto.randomUUID(),
                  clientId,
                  title: taskTitle.trim(),
                  date: dateStr,
                  isCompleted: false,
                  createdAt: Date.now() + i // Slight offset to keep sorting stable if needed
              });
          }
          // Add 24 hours safely
          cursor.setDate(cursor.getDate() + 1);
      }
      return batch;
  };

  const handleAssign = async () => {
    if (!taskTitle.trim()) {
        alert("과제 내용을 입력해주세요.");
        return;
    }
    if (selectedDays.length === 0) {
        alert("요일을 최소 하루 이상 선택해주세요.");
        return;
    }

    setIsLoading(true);
    const newHomeworkBatch = generateHomeworkBatch();

    if (newHomeworkBatch.length === 0) {
        alert("선택한 기간과 요일에 해당하는 날짜가 없습니다.");
        setIsLoading(false);
        return;
    }

    try {
        if (isFirebaseMode) {
            await firebaseService.saveHomeworkBatch(newHomeworkBatch);
        } else {
            storageService.saveHomeworkBatch(newHomeworkBatch);
        }

        const sortedBatch = newHomeworkBatch.sort((a,b) => b.createdAt - a.createdAt);
        setRecentHomework(prev => [...sortedBatch, ...prev]);
        
        setTaskTitle('');
        onAssign(); 
        alert(`${clientName}님에게 총 ${newHomeworkBatch.length}개의 과제를 등록했습니다.`);
        setActiveTab('LIST'); // Switch to list view after adding
    } catch (e) {
        console.error(e);
        alert("과제 등록 중 오류가 발생했습니다.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
      const newStatus = !currentStatus;
      
      // Optimistic Update
      setRecentHomework(prev => prev.map(h => h.id === id ? { ...h, isCompleted: newStatus } : h));

      try {
          if (isFirebaseMode) {
              await firebaseService.updateHomeworkStatus(id, newStatus);
          } else {
              storageService.updateHomeworkStatus(id, newStatus);
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("이 과제를 삭제하시겠습니까?")) return;

      setRecentHomework(prev => prev.filter(h => h.id !== id));

      try {
          if (isFirebaseMode) {
              await firebaseService.deleteHomework(id);
          } else {
              storageService.deleteHomework(id);
          }
      } catch (e) {
          console.error(e);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white flex-shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ListChecks className="w-5 h-5" /> 숙제 관리 ({clientName}님)
          </h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
            <button 
                onClick={() => setActiveTab('LIST')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'LIST' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
                과제 현황 & 체크
            </button>
            <button 
                onClick={() => setActiveTab('ASSIGN')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'ASSIGN' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
                새 과제 등록
            </button>
        </div>

        <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
            
            {activeTab === 'LIST' && (
                <div className="p-6 space-y-4">
                    {/* Stats Dashboard */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                                <circle cx="32" cy="32" r="28" fill="none" stroke="#4f46e5" strokeWidth="6" strokeDasharray="176" strokeDashoffset={176 - (176 * stats.rate / 100)} className="transition-all duration-1000 ease-out" />
                            </svg>
                            <span className="absolute text-xs font-bold text-indigo-600">{stats.rate}%</span>
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-gray-900">수행 현황 리포트</h4>
                            <p className="text-xs text-gray-500 mt-1">
                                총 {stats.total}개 중 <span className="text-indigo-600 font-bold">{stats.completed}개 완료</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {stats.rate >= 80 ? "아주 훌륭합니다! 🏆" : stats.rate >= 50 ? "꾸준히 하고 있어요 👍" : "조금 더 분발이 필요해요 💪"}
                            </p>
                        </div>
                    </div>

                    {/* Task List */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" /> 과제 리스트
                        </h4>
                        {recentHomework.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed">
                                과제 내역이 없습니다.
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {recentHomework.map(hw => (
                                    <li key={hw.id} className={`bg-white p-3 rounded-xl shadow-sm border flex items-center justify-between transition-colors ${hw.isCompleted ? 'border-indigo-100 bg-indigo-50/30' : 'border-gray-100'}`}>
                                        <div className="flex items-center gap-3 flex-1">
                                            <button 
                                                onClick={() => handleToggleStatus(hw.id, hw.isCompleted)}
                                                className={`transition-colors ${hw.isCompleted ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-400'}`}
                                            >
                                                {hw.isCompleted ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                                            </button>
                                            <div>
                                                <p className={`font-bold text-sm ${hw.isCompleted ? 'text-gray-800' : 'text-gray-900'}`}>{hw.title}</p>
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <CalendarIcon className="w-3 h-3" /> {hw.date}
                                                    {hw.isCompleted && <span className="ml-2 text-indigo-600 font-bold text-[10px]">완료 확인됨</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(hw.id)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="삭제"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    
                    {/* Bottom Back Button */}
                    <div className="pt-2">
                        <Button variant="secondary" onClick={onClose} className="w-full text-gray-500 border-gray-200">
                            <ArrowLeft className="w-4 h-4 mr-2" /> 닫기
                        </Button>
                    </div>
                </div>
            )}

            {activeTab === 'ASSIGN' && (
                <div className="p-6 space-y-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
                        {/* Content Input */}
                        <div>
                             <label className="block text-xs font-bold text-gray-500 mb-1">과제 내용</label>
                             <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={taskTitle}
                                    onChange={(e) => setTaskTitle(e.target.value)}
                                    placeholder="예: 드라이버 빈스윙 20회"
                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <select 
                                    className="w-1/3 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    onChange={(e) => setTaskTitle(e.target.value)}
                                    value=""
                                >
                                    <option value="">템플릿...</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.title}>{t.title}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">시작일</label>
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)} 
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">기간 설정</label>
                                <select 
                                    value={durationWeeks}
                                    onChange={(e) => setDurationWeeks(Number(e.target.value))}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {DURATION_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Frequency / Days */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 flex items-center justify-between">
                                <span>반복 요일 선택</span>
                                <span className="text-indigo-600 font-normal">주 {selectedDays.length}회</span>
                            </label>
                            <div className="flex justify-between gap-1">
                                {WEEK_DAYS.map(day => {
                                    const isSelected = selectedDays.includes(day.value);
                                    return (
                                        <button
                                            key={day.value}
                                            onClick={() => toggleDay(day.value)}
                                            className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${
                                                isSelected 
                                                ? 'bg-indigo-600 text-white shadow-md transform scale-105' 
                                                : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-3 rounded-lg flex items-center justify-between">
                            <span className="text-xs text-indigo-700 font-medium">총 생성될 과제 수</span>
                            <span className="text-lg font-bold text-indigo-900">{calculateTotalTasks()}개</span>
                        </div>

                        <Button onClick={handleAssign} isLoading={isLoading} className="w-full mt-2" icon={<Repeat className="w-4 h-4" />}>
                            과제 일괄 등록하기
                        </Button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
