
import React, { useState, useEffect, useMemo } from 'react';
import { Homework, HomeworkTemplate } from '../types';
import { Button } from './Button';
import { X, ListChecks, Calendar as CalendarIcon, Repeat, Trash2, CheckSquare, Square, CheckCircle2, ArrowLeft } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { useLanguage } from './LanguageContext';
import { createLogger } from '../utils/logger';

const log = createLogger('homeworkModal');

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
  const { t } = useLanguage();

  const WEEK_DAYS = [
    { label: t('day_sun'), value: 0 },
    { label: t('day_mon'), value: 1 },
    { label: t('day_tue'), value: 2 },
    { label: t('day_wed'), value: 3 },
    { label: t('day_thu'), value: 4 },
    { label: t('day_fri'), value: 5 },
    { label: t('day_sat'), value: 6 },
  ];

  const DURATION_OPTIONS = [
    { label: t('duration_1w'), value: 1 },
    { label: t('duration_2w'), value: 2 },
    { label: t('duration_4w'), value: 4 },
    { label: t('duration_8w'), value: 8 },
    { label: t('duration_12w'), value: 12 },
  ];

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
        alert(t('hw_validation_no_content'));
        return;
    }
    if (selectedDays.length === 0) {
        alert(t('hw_validation_select_day'));
        return;
    }

    setIsLoading(true);
    const newHomeworkBatch = generateHomeworkBatch();

    if (newHomeworkBatch.length === 0) {
        alert(t('hw_no_dates_generated'));
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
        alert(t('hw_assign_success').replace('{name}', clientName).replace('{count}', String(newHomeworkBatch.length)));
        setActiveTab('LIST'); // Switch to list view after adding
    } catch (e) {
        log.error(e);
        alert(t('hw_assign_error'));
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
          log.error(e);
      }
  };

  const handleDelete = async (id: string) => {
      if (!confirm(t('hw_confirm_delete'))) return;

      setRecentHomework(prev => prev.filter(h => h.id !== id));

      try {
          if (isFirebaseMode) {
              await firebaseService.deleteHomework(id);
          } else {
              storageService.deleteHomework(id);
          }
      } catch (e) {
          log.error(e);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-bg-raised rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white flex-shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <ListChecks className="w-5 h-5" /> {t('homework_modal_title').replace('{name}', clientName)}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-line-subtle flex-shrink-0">
            <button 
                onClick={() => setActiveTab('LIST')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'LIST' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-ink-muted hover:text-ink-medium'}`}
            >
                {t('homework_tab_list')}
            </button>
            <button 
                onClick={() => setActiveTab('ASSIGN')}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'ASSIGN' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-ink-muted hover:text-ink-medium'}`}
            >
                {t('homework_tab_assign')}
            </button>
        </div>

        <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-bg-base">
            
            {activeTab === 'LIST' && (
                <div className="p-6 space-y-4">
                    {/* Stats Dashboard */}
                    <div className="bg-bg-raised p-4 rounded-xl border border-line-subtle shadow-sm flex items-center gap-4">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                                <circle cx="32" cy="32" r="28" fill="none" stroke="#4f46e5" strokeWidth="6" strokeDasharray="176" strokeDashoffset={176 - (176 * stats.rate / 100)} className="transition-all duration-1000 ease-out" />
                            </svg>
                            <span className="absolute text-xs font-bold text-indigo-600">{stats.rate}%</span>
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-ink-high">{t('homework_stats_title')}</h4>
                            <p className="text-xs text-ink-medium mt-1">
                                {t('homework_stats_count').replace('{total}', String(stats.total)).replace('{completed}', String(stats.completed))}
                            </p>
                            <p className="text-xs text-ink-muted mt-1">
                                {stats.rate >= 80 ? t('hw_motivation_high') : stats.rate >= 50 ? t('hw_motivation_mid') : t('hw_motivation_low')}
                            </p>
                        </div>
                    </div>

                    {/* Task List */}
                    <div>
                        <h4 className="text-sm font-bold text-ink-high mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" /> {t('homework_task_list_title')}
                        </h4>
                        {recentHomework.length === 0 ? (
                            <div className="text-center py-10 text-ink-muted bg-bg-raised rounded-xl border border-line-default border-dashed">
                                {t('homework_empty')}
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {recentHomework.map(hw => (
                                    <li key={hw.id} className={`bg-bg-raised p-3 rounded-xl shadow-sm border flex items-center justify-between transition-colors ${hw.isCompleted ? 'border-indigo-100 bg-primary-500/10/30' : 'border-line-subtle'}`}>
                                        <div className="flex items-center gap-3 flex-1">
                                            <button 
                                                onClick={() => handleToggleStatus(hw.id, hw.isCompleted)}
                                                className={`transition-colors ${hw.isCompleted ? 'text-indigo-600' : 'text-ink-muted hover:text-ink-muted'}`}
                                            >
                                                {hw.isCompleted ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                                            </button>
                                            <div>
                                                <p className={`font-bold text-sm ${hw.isCompleted ? 'text-ink-high' : 'text-ink-high'}`}>{hw.title}</p>
                                                <p className="text-xs text-ink-medium flex items-center gap-1">
                                                    <CalendarIcon className="w-3 h-3" /> {hw.date}
                                                    {hw.isCompleted && <span className="ml-2 text-indigo-600 font-bold text-[10px]">{t('homework_done_confirmed')}</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(hw.id)}
                                            className="p-2 text-ink-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
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
                        <Button variant="secondary" onClick={onClose} className="w-full text-ink-medium border-line-default">
                            <ArrowLeft className="w-4 h-4 mr-2" /> {t('close_label')}
                        </Button>
                    </div>
                </div>
            )}

            {activeTab === 'ASSIGN' && (
                <div className="p-6 space-y-4">
                    <div className="bg-bg-raised p-5 rounded-xl border border-line-default space-y-4">
                        {/* Content Input */}
                        <div>
                             <label className="block text-xs font-bold text-ink-medium mb-1">{t('homework_task_label')}</label>
                             <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={taskTitle}
                                    onChange={(e) => setTaskTitle(e.target.value)}
                                    placeholder={t('homework_placeholder')}
                                    className="flex-1 border border-line-default rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <select 
                                    className="w-1/3 border border-line-default rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    onChange={(e) => setTaskTitle(e.target.value)}
                                    value=""
                                >
                                    <option value="">{t('homework_template_placeholder')}</option>
                                    {templates.map(tmpl => (
                                        <option key={tmpl.id} value={tmpl.title}>{tmpl.title}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-ink-medium mb-1">{t('homework_start_date')}</label>
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={(e) => setStartDate(e.target.value)} 
                                    className="w-full border border-line-default rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-ink-medium mb-1">{t('homework_duration')}</label>
                                <select 
                                    value={durationWeeks}
                                    onChange={(e) => setDurationWeeks(Number(e.target.value))}
                                    className="w-full border border-line-default rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {DURATION_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Frequency / Days */}
                        <div>
                            <label className="block text-xs font-bold text-ink-medium mb-2 flex items-center justify-between">
                                <span>{t('homework_days_select')}</span>
                                <span className="text-indigo-600 font-normal">{t('homework_times_per_week').replace('{n}', String(selectedDays.length))}</span>
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
                                                ? 'bg-slate-700 text-white shadow-md transform scale-105' 
                                                : 'bg-bg-raised border border-line-default text-ink-medium hover:bg-bg-overlay'
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-primary-500/10 p-3 rounded-lg flex items-center justify-between">
                            <span className="text-xs text-primary-300 font-medium">{t('homework_total_label')}</span>
                            <span className="text-lg font-bold text-indigo-900">{t('homework_total_count_unit').replace('{n}', String(calculateTotalTasks()))}</span>
                        </div>

                        <Button onClick={handleAssign} isLoading={isLoading} className="w-full mt-2" icon={<Repeat className="w-4 h-4" />}>
                            {t('homework_assign_btn')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
