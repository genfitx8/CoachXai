import React, { useState } from 'react';
import {
  Search,
  UserCheck,
  Loader2,
  AlertCircle,
  User,
  Check,
} from 'lucide-react';
import { Button } from './Button';
import { createLogger } from '../utils/logger';

const log = createLogger('coachSearch');

export interface CoachSearchResult {
  id: string;
  name: string;
  phoneLast4: string;
}

interface CoachSearchProps {
  onAssign: (coach: { id: string; name: string }) => void;
  onRemove?: () => void;
  assignedCoachName?: string;
  onSearch: (term: string) => Promise<CoachSearchResult[]>;
}

export const CoachSearch: React.FC<CoachSearchProps> = ({
  onAssign,
  onRemove,
  assignedCoachName,
  onSearch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CoachSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setHasSearched(false);

    try {
      const data = await onSearch(searchTerm);
      setResults(data);
    } catch (error) {
      log.error('Search failed', error);
      setResults([]);
    } finally {
      setIsLoading(false);
      setHasSearched(true);
    }
  };

  const handleAssignClick = (coach: CoachSearchResult) => {
    if (
      confirm(
        `${coach.name} (***-****-${coach.phoneLast4}) 코치님을 담당 코치로 지정하시겠습니까?`
      )
    ) {
      onAssign({ id: coach.id, name: coach.name });
      setSearchTerm('');
      setResults([]);
      setHasSearched(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600" /> 담당 코치 지정
        </label>
        {assignedCoachName && (
          <button
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-700 underline font-medium"
          >
            지정 해제
          </button>
        )}
      </div>

      {assignedCoachName ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
          <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-bold mb-0.5">
              현재 담당 코치
            </p>
            <p className="text-lg font-bold text-gray-900">
              {assignedCoachName}
            </p>
          </div>
          <div className="ml-auto bg-white p-1 rounded-full text-emerald-700 shadow-sm">
            <Check className="w-4 h-4" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="코치 이름으로 검색하세요"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearch(e as any);
                  }
                }}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-700 outline-none transition-all"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSearch(e as any);
                }}
                disabled={isLoading || !searchTerm.trim()}
                className="absolute right-2 top-2 bottom-2 bg-gray-900 text-white px-3 rounded-lg text-xs font-bold hover:bg-black disabled:bg-gray-300 transition-colors"
              >
                검색
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          )}

          {/* Results List */}
          {!isLoading && hasSearched && (
            <div className="border border-gray-100 rounded-xl overflow-hidden animate-fade-in">
              {results.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {results.map((coach) => (
                    <li
                      key={coach.id}
                      className="p-3 hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 p-2 rounded-full text-gray-500">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">
                            {coach.name}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            ***-****-{coach.phoneLast4}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleAssignClick(coach)}
                        className="text-xs py-1.5 px-3 h-auto"
                        variant="secondary"
                      >
                        선택
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-6 text-center text-gray-500 text-sm bg-gray-50 flex flex-col items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-gray-400" />
                  <p>검색 결과가 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
