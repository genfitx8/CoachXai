import React, { useMemo, useState } from 'react';
import { CoachProfile } from '../types';
import { Calendar, Users, Search, ChevronRight, User as UserIcon } from 'lucide-react';
import { ReservationManager } from './ReservationManager';
import { useLanguage } from './LanguageContext';

interface AdminReservationManagerProps {
  coaches: CoachProfile[];
  onCoachUpdated: (coach: CoachProfile) => void;
}

export const AdminReservationManager: React.FC<AdminReservationManagerProps> = ({
  coaches,
  onCoachUpdated,
}) => {
  const { t } = useLanguage();
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedCoach = useMemo(
    () => coaches.find((c) => c.id === selectedCoachId) ?? null,
    [coaches, selectedCoachId]
  );

  const filteredCoaches = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return coaches;
    return coaches.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.phone && c.phone.includes(term))
    );
  }, [coaches, searchTerm]);

  if (selectedCoach) {
    return (
      <ReservationManager
        coachProfile={selectedCoach}
        onBack={() => setSelectedCoachId(null)}
        onCoachUpdated={onCoachUpdated}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('admin_reservation_all_pros_title')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('admin_reservation_all_pros_desc')}</p>
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            data-testid="admin-reservation-coach-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('admin_search_placeholder')}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <Users className="w-3.5 h-3.5" />
          <span className="font-semibold">{t('admin_reservation_pick_coach')}</span>
          <span className="ml-auto text-gray-400">
            {filteredCoaches.length} / {coaches.length}
          </span>
        </div>

        {coaches.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
            {t('admin_reservation_no_coaches')}
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
            {t('admin_search_placeholder')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCoaches.map((coach) => {
              const workingDays = coach.workingSchedule
                ? Object.values(coach.workingSchedule).filter(
                    (d) => d && !d.isClosed
                  ).length
                : 0;
              return (
                <button
                  key={coach.id}
                  data-testid={`admin-select-coach-${coach.id}`}
                  onClick={() => setSelectedCoachId(coach.id)}
                  className="group text-left bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl px-4 py-3 transition-all flex items-center gap-3 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {coach.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{coach.name}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {coach.email || coach.phone || '-'}
                    </p>
                    <p className="text-[11px] text-indigo-600 mt-0.5">
                      {workingDays > 0 ? `근무일 ${workingDays}일/주` : '근무 일정 미설정'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {coaches.length > 0 && (
          <p className="text-xs text-gray-400 mt-4 text-center">
            {t('admin_reservation_no_coach_selected')}
          </p>
        )}
      </div>
    </div>
  );
};
