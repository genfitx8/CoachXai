/**
 * CoachXPreviewStrip
 *
 * Compact inline strip rendered on the coach home screen.
 * Shows a real-time CoachX data snapshot — member trend distribution and top
 * urgency alerts — so coaches see actionable intelligence without navigating
 * into the full CoachX Hub.
 */

import React, { useMemo } from 'react';
import {
  TrendingUp, Pause, Clock, Sprout, ChevronRight, AlertTriangle, Sparkles,
} from 'lucide-react';
import { Lesson, ClientProfile } from '../types';
import { buildMemberGrowthReports } from '../services/coachXService';
import { useLanguage } from './LanguageContext';

interface CoachXPreviewStripProps {
  lessons: Lesson[];
  clients: ClientProfile[];
  onOpenCoachX: () => void;
}

export const CoachXPreviewStrip: React.FC<CoachXPreviewStripProps> = ({
  lessons,
  clients,
  onOpenCoachX,
}) => {
  const { language, t } = useLanguage();

  const reports = useMemo(
    () => buildMemberGrowthReports(lessons, clients, language),
    [lessons, clients, language]
  );

  if (reports.length === 0) return null;

  const improving = reports.filter(r => r.trendIndicator === 'improving').length;
  const plateau   = reports.filter(r => r.trendIndicator === 'plateau').length;
  const inactive  = reports.filter(r => r.trendIndicator === 'inactive').length;
  const newMembers = reports.filter(r => r.trendIndicator === 'new').length;

  // Top urgency names (inactive first, then plateau)
  const urgentNames = [
    ...reports.filter(r => r.trendIndicator === 'inactive').map(r => r.clientName),
    ...reports.filter(r => r.trendIndicator === 'plateau').map(r => r.clientName),
  ].slice(0, 3);

  const hasUrgency = inactive > 0 || plateau > 0;

  const trendPills: Array<{
    count: number;
    labelKey: string;
    icon: React.ReactNode;
    pillClass: string;
  }> = [
    {
      count: improving,
      labelKey: 'coachx_preview_improving',
      icon: <TrendingUp className="w-3 h-3" />,
      pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      count: plateau,
      labelKey: 'coachx_preview_plateau',
      icon: <Pause className="w-3 h-3" />,
      pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      count: inactive,
      labelKey: 'coachx_preview_inactive',
      icon: <Clock className="w-3 h-3" />,
      pillClass: 'bg-red-50 text-red-600 border-red-200',
    },
    {
      count: newMembers,
      labelKey: 'coachx_preview_new',
      icon: <Sprout className="w-3 h-3" />,
      pillClass: 'bg-sky-50 text-sky-700 border-sky-200',
    },
  ].filter(p => p.count > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        onClick={onOpenCoachX}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        aria-label={t('coachx_preview_open_label')}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-800">
            {t('coachx_preview_title')}
          </span>
        </div>
        <div className="flex items-center gap-1 text-violet-600">
          <span className="text-xs font-semibold">{t('coachx_preview_view_all')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* Trend pills */}
      {trendPills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {trendPills.map((pill, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${pill.pillClass}`}
            >
              {pill.icon}
              {pill.count} {t(pill.labelKey)}
            </span>
          ))}
        </div>
      )}

      {/* Urgency alert */}
      {hasUrgency && urgentNames.length > 0 && (
        <div className="mx-4 mb-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">{urgentNames.join(', ')}</span>
            {' '}
            {t('coachx_preview_urgency_suffix')}
          </p>
        </div>
      )}
    </div>
  );
};
