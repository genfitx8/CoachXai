import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  CheckCircle,
  Circle,
  BookOpen,
  Trash2,
  ClipboardList,
  X,
  Save,
} from 'lucide-react';
import { LessonPackage, Lesson, ClientProfile } from '../types';
import { Button } from './Button';
import { useLanguage } from './LanguageContext';

const MIN_SESSIONS = 1;
const MAX_SESSIONS = 100;

interface LessonPackageManagerProps {
  client: ClientProfile;
  packages: LessonPackage[];
  lessons: Lesson[];
  coachId: string;
  onBack: () => void;
  onSavePackage: (pkg: LessonPackage) => void;
  onDeletePackage: (packageId: string) => void;
  /** Called when coach wants to record a lesson for a specific session. */
  onRecordSession: (pkg: LessonPackage, sessionNumber: number) => void;
  /** Called when coach wants to view an existing lesson record. */
  onViewLesson: (lesson: Lesson) => void;
}

export const LessonPackageManager: React.FC<LessonPackageManagerProps> = ({
  client,
  packages,
  lessons,
  coachId,
  onBack,
  onSavePackage,
  onDeletePackage,
  onRecordSession,
  onViewLesson,
}) => {
  const { t } = useLanguage();
  const [showNewPackageModal, setShowNewPackageModal] = useState(false);
  const [totalSessionsInput, setTotalSessionsInput] = useState('');
  const [formError, setFormError] = useState('');

  const clientId = `${client.name}_${client.phone}`;

  // Packages belonging to this client, sorted newest first
  const clientPackages = useMemo(
    () =>
      packages
        .filter((p) => p.clientId === clientId && p.coachId === coachId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [packages, clientId, coachId]
  );

  // Lessons belonging to this client that have a package link
  const packageLessons = useMemo(
    () =>
      lessons.filter(
        (l) =>
          l.clientName === client.name &&
          l.clientPhone === client.phone &&
          l.lessonPackageId != null
      ),
    [lessons, client]
  );

  const getSessionLesson = (packageId: string, sessionNumber: number): Lesson | undefined =>
    packageLessons.find(
      (l) => l.lessonPackageId === packageId && l.sessionNumber === sessionNumber
    );

  const handleCreatePackage = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseInt(totalSessionsInput, 10);
    if (!total || total < MIN_SESSIONS || total > MAX_SESSIONS) {
      setFormError(`횟수는 ${MIN_SESSIONS}~${MAX_SESSIONS} 사이로 입력해 주세요.`);
      return;
    }
    const now = Date.now();
    const newPkg: LessonPackage = {
      id: `pkg_${coachId}_${clientId}_${now}`,
      coachId,
      clientId,
      clientName: client.name,
      clientPhone: client.phone,
      totalSessions: total,
      createdAt: now,
      updatedAt: now,
    };
    onSavePackage(newPkg);
    setTotalSessionsInput('');
    setFormError('');
    setShowNewPackageModal(false);
  };

  const handleDeletePackage = (pkg: LessonPackage) => {
    const hasRecords = packageLessons.some((l) => l.lessonPackageId === pkg.id);
    const msg = hasRecords
      ? `이 패키지(${pkg.totalSessions}회)에는 기록된 레슨이 있습니다.\n삭제하면 패키지가 제거되지만 레슨 기록은 유지됩니다.\n정말 삭제하시겠습니까?`
      : t('pkg_delete_confirm');
    if (window.confirm(msg)) {
      onDeletePackage(pkg.id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> 돌아가기
        </Button>
        <div className="text-right">
          <h2 className="text-xl font-bold text-gray-900">{t('pkg_title')}</h2>
          <p className="text-sm text-gray-500">
            {client.name} ({client.phone})
          </p>
        </div>
      </div>

      {/* New package button */}
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setTotalSessionsInput('');
            setFormError('');
            setShowNewPackageModal(true);
          }}
          className="bg-slate-700 hover:bg-slate-800"
        >
          <Plus className="w-4 h-4 mr-2" /> {t('pkg_create_btn')}
        </Button>
      </div>

      {/* Package list */}
      {clientPackages.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">{t('pkg_no_packages')}</p>
          <p className="text-sm text-gray-400 mt-1">
            새 레슨 패키지를 등록하여 회차별 레슨을 기록하세요.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {clientPackages.map((pkg) => {
            const completedSessions = Array.from(
              { length: pkg.totalSessions },
              (_, i) => i + 1
            ).filter((n) => getSessionLesson(pkg.id, n) != null).length;
            const remaining = pkg.totalSessions - completedSessions;

            return (
              <div
                key={pkg.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Package header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-indigo-50">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    <div>
                      <span className="font-bold text-gray-900">
                        {pkg.totalSessions}회 레슨 패키지
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        등록일: {new Date(pkg.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Progress summary */}
                    <div className="text-right text-sm">
                      <span className="font-bold text-indigo-700">{completedSessions}</span>
                      <span className="text-gray-400">/{pkg.totalSessions}회 완료</span>
                      {remaining > 0 && (
                        <p className="text-xs text-gray-400">{remaining}회 남음</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeletePackage(pkg)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="패키지 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-5 pt-3 pb-1">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${pkg.totalSessions > 0 ? (completedSessions / pkg.totalSessions) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Session grid */}
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from({ length: pkg.totalSessions }, (_, i) => i + 1).map(
                      (sessionNumber) => {
                        const existingLesson = getSessionLesson(pkg.id, sessionNumber);
                        const isCompleted = existingLesson != null;

                        return (
                          <button
                            key={sessionNumber}
                            onClick={() => {
                              if (isCompleted && existingLesson) {
                                onViewLesson(existingLesson);
                              } else {
                                onRecordSession(pkg, sessionNumber);
                              }
                            }}
                            className={`
                              flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all
                              ${
                                isCompleted
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                  : 'border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600'
                              }
                            `}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-5 h-5 text-indigo-500" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                            <span className="text-xs font-bold">{sessionNumber}회차</span>
                            {isCompleted && existingLesson && (
                              <span className="text-[10px] text-indigo-500 leading-tight text-center line-clamp-1">
                                {existingLesson.date}
                              </span>
                            )}
                            {!isCompleted && (
                              <span className="text-[10px] leading-tight">기록하기</span>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Package Modal */}
      {showNewPackageModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">{t('pkg_create_title')}</h3>
              <button onClick={() => setShowNewPackageModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePackage} className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  <span className="font-bold text-gray-900">{client.name}</span> 회원의
                  레슨 총 횟수를 입력하세요.
                </p>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  {t('pkg_sessions_input')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={MIN_SESSIONS}
                  max={MAX_SESSIONS}
                  value={totalSessionsInput}
                  onChange={(e) => {
                    setTotalSessionsInput(e.target.value);
                    setFormError('');
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center text-2xl font-bold"
                  placeholder="예: 10"
                  autoFocus
                  required
                />
                {formError && (
                  <p className="text-xs text-red-500 mt-1">{formError}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {MIN_SESSIONS}회~{MAX_SESSIONS}회까지 입력 가능합니다.
                </p>
              </div>
              <Button type="submit" className="w-full bg-slate-700 hover:bg-slate-800">
                <Save className="w-4 h-4 mr-2" /> {t('pkg_create_btn')}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
