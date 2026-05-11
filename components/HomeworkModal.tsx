import React, { useState, useEffect, useMemo } from 'react';
import { Homework, HomeworkTemplate } from '../types';
import { Button } from './Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { ArrowLeft, Calendar as CalendarIcon, CheckCircle2, CheckSquare, ListChecks, Repeat, Square, Trash2 } from 'lucide-react';
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

  const title = (
    <span className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300">
        <ListChecks className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-2xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Homework
        </span>
        <span className="block text-base font-semibold text-ink-high">
          {t('homework_modal_title').replace('{name}', clientName)}
        </span>
      </span>
    </span>
  );

  return (
    <Modal open={isOpen} onClose={onClose} title={title} size="lg">
      {/* Tab Header */}
      <div className="-mx-6 mb-4 grid grid-cols-2 gap-1 border-b border-line-subtle px-6">
        {(['LIST', 'ASSIGN'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={active}
              className={`-mb-px h-10 border-b-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary-400 text-primary-300'
                  : 'border-transparent text-ink-muted hover:text-ink-high'
              }`}
            >
              {tab === 'LIST' ? t('homework_tab_list') : t('homework_tab_assign')}
            </button>
          );
        })}
      </div>

      {activeTab === 'LIST' && (
        <div className="space-y-4">
          {/* Stats Dashboard */}
          <div className="flex items-center gap-4 rounded-xl border border-line-subtle bg-bg-base p-4">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform">
                <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="6"
                  strokeDasharray="176"
                  strokeDashoffset={176 - (176 * stats.rate) / 100}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <span className="absolute text-xs font-semibold text-primary-300">{stats.rate}%</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-ink-high">{t('homework_stats_title')}</h4>
              <p className="mt-1 text-xs text-ink-medium">
                {t('homework_stats_count')
                  .replace('{total}', String(stats.total))
                  .replace('{completed}', String(stats.completed))}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {stats.rate >= 80
                  ? t('hw_motivation_high')
                  : stats.rate >= 50
                  ? t('hw_motivation_mid')
                  : t('hw_motivation_low')}
              </p>
            </div>
          </div>

          {/* Task List */}
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-high">
              <CheckCircle2 className="h-4 w-4" /> {t('homework_task_list_title')}
            </h4>
            {recentHomework.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-default bg-bg-base/60 py-10 text-center text-ink-muted">
                {t('homework_empty')}
              </div>
            ) : (
              <ul className="space-y-2">
                {recentHomework.map((hw) => (
                  <li
                    key={hw.id}
                    className={`flex items-center justify-between rounded-xl border bg-bg-base p-3 transition-colors ${
                      hw.isCompleted ? 'border-primary-500/30' : 'border-line-subtle'
                    }`}
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(hw.id, hw.isCompleted)}
                        aria-pressed={hw.isCompleted}
                        className={`transition-colors ${
                          hw.isCompleted ? 'text-primary-300' : 'text-ink-muted hover:text-ink-medium'
                        }`}
                      >
                        {hw.isCompleted ? <CheckSquare className="h-6 w-6" /> : <Square className="h-6 w-6" />}
                      </button>
                      <div>
                        <p className="text-sm font-semibold text-ink-high">{hw.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-medium">
                          <CalendarIcon className="h-3 w-3" /> {hw.date}
                          {hw.isCompleted && (
                            <span className="ml-2 text-2xs font-semibold text-primary-300">
                              {t('homework_done_confirmed')}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(hw.id)}
                      className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="삭제"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            variant="secondary"
            onClick={onClose}
            fullWidth
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            {t('close_label')}
          </Button>
        </div>
      )}

      {activeTab === 'ASSIGN' && (
        <div className="space-y-4">
          {/* Content + template */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              label={t('homework_task_label')}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={t('homework_placeholder')}
              containerClassName="flex-1"
            />
            <div className="flex flex-col gap-1.5 sm:w-40">
              <label className="text-sm font-medium text-ink-medium">
                {t('homework_template_placeholder')}
              </label>
              <select
                className="h-11 rounded-lg border border-line-default bg-bg-overlay px-3 text-sm text-ink-high outline-none transition-colors focus:border-primary-500 focus:shadow-ring-primary"
                onChange={(e) => setTaskTitle(e.target.value)}
                value=""
              >
                <option value="">{t('homework_template_placeholder')}</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.title}>
                    {tmpl.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('homework_start_date')}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-medium">
                {t('homework_duration')}
              </label>
              <select
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(Number(e.target.value))}
                className="h-11 rounded-lg border border-line-default bg-bg-overlay px-3 text-sm text-ink-high outline-none transition-colors focus:border-primary-500 focus:shadow-ring-primary"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequency / Days */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink-medium">{t('homework_days_select')}</span>
              <span className="text-xs text-primary-300">
                {t('homework_times_per_week').replace('{n}', String(selectedDays.length))}
              </span>
            </div>
            <div className="flex justify-between gap-1">
              {WEEK_DAYS.map((day) => {
                const isSelected = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    aria-pressed={isSelected}
                    className={`h-10 w-10 rounded-full text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-primary-500 text-white shadow-elev-2'
                        : 'border border-line-default bg-bg-overlay text-ink-medium hover:border-line-strong hover:text-ink-high'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary-500/20 bg-primary-500/10 px-3 py-3">
            <span className="text-xs font-medium text-primary-300">{t('homework_total_label')}</span>
            <span className="text-lg font-semibold text-primary-200">
              {t('homework_total_count_unit').replace('{n}', String(calculateTotalTasks()))}
            </span>
          </div>

          <Button
            onClick={handleAssign}
            isLoading={isLoading}
            fullWidth
            size="lg"
            icon={<Repeat className="h-4 w-4" />}
          >
            {t('homework_assign_btn')}
          </Button>
        </div>
      )}
    </Modal>
  );
};
