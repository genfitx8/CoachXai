import React, { useState, useMemo } from 'react';
import { ClientProfile } from '../types';
import { Button } from './Button';
import {
  ArrowLeft,
  UserPlus,
  Search,
  Edit,
  Trash2,
  User,
  Phone,
  Save,
  X,
  MessageSquare,
  Briefcase,
  ClipboardList,
  Dumbbell,
  BookOpen,
} from 'lucide-react';

interface CoachClientManagerProps {
  clients: ClientProfile[];
  onAdd: (client: ClientProfile) => void;
  onUpdate: (client: ClientProfile) => void;
  onDelete: (client: ClientProfile) => void;
  onBack: () => void;
  coachId?: string; // Added: Coach ID for filtering and assignment
  /** Called when coach taps a member's lesson package button. */
  onManagePackages?: (client: ClientProfile) => void;
  /** Called when coach wants to generate a training program for a member. */
  onGenerateProgram?: (client: ClientProfile) => void;
  /** Called when coach wants to generate a material for a member. */
  onGenerateMaterial?: (client: ClientProfile) => void;
}

export const CoachClientManager: React.FC<CoachClientManagerProps> = ({
  clients,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
  coachId,
  onManagePackages,
  onGenerateProgram,
  onGenerateMaterial,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(
    null
  );

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [memo, setMemo] = useState('');

  // Filter clients to show only those assigned to this coach
  // coachId가 있으면 해당 코치에게 할당된 회원만 표시
  const myClients = useMemo(() => {
    if (!coachId) {
      console.warn('CoachClientManager: coachId가 전달되지 않았습니다.');
      return [];
    }

    // 현재 코치에게 할당된 회원만 필터링
    const filtered = clients.filter((c) => {
      // coachId가 없거나 빈 문자열이면 제외
      if (!c.coachId || c.coachId.trim() === '') {
        return false;
      }
      // 현재 코치에게 할당된 회원만 포함
      return c.coachId === coachId;
    });

    console.log(
      `CoachClientManager: coachId=${coachId}, 전체 회원=${clients.length}, 필터링된 회원=${filtered.length}`
    );
    return filtered;
  }, [clients, coachId]);

  const filteredClients = myClients.filter(
    (c) => c.name.includes(searchTerm) || c.phone.includes(searchTerm)
  );

  const openAddModal = () => {
    setEditingClient(null);
    setName('');
    setPhone('');
    setMemo('');
    setIsModalOpen(true);
  };

  const openEditModal = (client: ClientProfile) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setMemo(client.memo || '');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      alert('이름과 전화번호는 필수입니다.');
      return;
    }

    if (editingClient) {
      // Update - preserve coachId (designatedCoach는 App.tsx에서 자동 설정됨)
      onUpdate({
        ...editingClient,
        name,
        phone,
        memo,
        // coachId는 기존 값 유지 (변경하지 않음)
      });
    } else {
      // Add New
      // Check for duplicate in global list
      const existingClient = clients.find(
        (c) => c.name === name && c.phone === phone
      );

      if (existingClient) {
        // 다른 코치에게 배정된 회원인지 확인
        if (
          existingClient.coachId &&
          existingClient.coachId.trim() !== '' &&
          existingClient.coachId !== coachId
        ) {
          alert('다른 코치에게 배정된 회원입니다.');
          return;
        }

        // 이미 현재 코치에게 배정된 회원
        if (existingClient.coachId === coachId) {
          alert('이미 등록된 회원입니다.');
          return;
        }

        // coachId가 없는 경우 (할당되지 않은 회원) - 현재 코치에게 할당
        // 이 경우는 업데이트로 처리
        const updatedClient: ClientProfile = {
          ...existingClient,
          memo: memo || existingClient.memo,
          coachId: coachId, // 현재 코치에게 할당
        };
        onUpdate(updatedClient);
        setIsModalOpen(false);
        return;
      }

      // 새 회원 추가
      const newClient: ClientProfile = {
        name,
        phone,
        memo,
        isSubscribed: false,
        currentPoints: 0,
        coachId: coachId, // Automatically assign this coach
      };
      onAdd(newClient);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (client: ClientProfile) => {
    if (
      confirm(
        `'${client.name}' 회원을 관리 목록에서 제외하시겠습니까?\n담당 코치 지정이 해제됩니다.`
      )
    ) {
      // 회원 계정을 삭제하지 않고 coachId만 제거
      const updatedClient: ClientProfile = {
        ...client,
        coachId: undefined, // 담당 코치 해제
      };
      onUpdate(updatedClient);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="pl-0">
          <ArrowLeft className="w-5 h-5 mr-1" /> 돌아가기
        </Button>
        <h2 className="text-xl font-bold text-gray-900">회원 관리</h2>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div className="relative w-full sm:w-auto flex-1">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <Button
          onClick={openAddModal}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700"
        >
          <UserPlus className="w-5 h-5 mr-2" /> 회원 직접 등록
        </Button>
      </div>

      {/* Client List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">
              {coachId
                ? myClients.length === 0
                  ? '아직 관리하는 회원이 없습니다.'
                  : '검색 결과가 없습니다.'
                : '코치 정보를 불러올 수 없습니다.'}
            </p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={`${client.name}_${client.phone}`}
              className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg">
                    {client.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{client.name}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {client.phone}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditModal(client)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(client)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {client.memo && (
                <div className="bg-gray-50 p-3 rounded-lg mb-3">
                  <p className="text-xs text-gray-600 line-clamp-2 flex gap-1">
                    <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />{' '}
                    {client.memo}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
                <Briefcase className="w-3 h-3" />
                {client.golfExperience || '구력 정보 없음'}
              </div>

              {onManagePackages && (
                <button
                  onClick={() => onManagePackages(client)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                >
                  <ClipboardList className="w-4 h-4" />
                  레슨 패키지 관리
                </button>
              )}
              {onGenerateProgram && (
                <button
                  onClick={() => onGenerateProgram(client)}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
                >
                  <Dumbbell className="w-4 h-4" />
                  훈련 프로그램 생성
                </button>
              )}
              {onGenerateMaterial && (
                <button
                  onClick={() => onGenerateMaterial(client)}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium"
                >
                  <BookOpen className="w-4 h-4" />
                  교재 생성
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">
                {editingClient ? '회원 정보 수정' : '새 회원 등록'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="회원 이름"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  전화번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="010-0000-0000"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  *전화번호는 회원 식별을 위한 고유 ID로 사용됩니다.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  메모
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="회원 특이사항, 목표 등"
                  rows={3}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  <Save className="w-4 h-4 mr-2" /> 저장하기
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
