import React from 'react';
import { Button } from './Button';
import {
  LogOut,
  Clock,
  CalendarOff,
  Layout,
  DollarSign,
  XCircle,
  Building2,
} from 'lucide-react';

interface BranchAdminDashboardProps {
  branchName: string;
  username: string;
  onLogout: () => void;
}

export const BranchAdminDashboard: React.FC<BranchAdminDashboardProps> = ({
  branchName,
  username,
  onLogout,
}) => {
  const menuItems = [
    {
      icon: <Clock className="w-6 h-6" />,
      label: '운영시간/휴무일',
      description: '지점 운영시간과 휴무일을 설정합니다.',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      icon: <Layout className="w-6 h-6" />,
      label: '베이 관리',
      description: '타석(베이) 목록을 관리합니다.',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      label: '가격 관리',
      description: '요일/시간대별 포인트 가격을 설정합니다.',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      icon: <XCircle className="w-6 h-6" />,
      label: '취소요청',
      description: '회원의 예약 취소 요청을 처리합니다.',
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-tight">
                {branchName}
              </h1>
              <p className="text-xs text-gray-500">{username} · 지점 관리자</p>
            </div>
          </div>
          <Button
            onClick={onLogout}
            className="bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm py-2 px-4 flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-6">
        {/* Welcome Card */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-2xl p-6 text-white shadow-md">
          <p className="text-emerald-100 text-sm mb-1">안녕하세요, {username}님</p>
          <h2 className="text-2xl font-bold">{branchName} 관리 대시보드</h2>
          <p className="text-emerald-100 text-sm mt-2">
            아래 메뉴에서 지점 운영을 관리하세요.
          </p>
        </div>

        {/* Feature Menu Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <div
              key={item.label}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-start gap-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${item.bg} ${item.color}`}
              >
                {item.icon}
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{item.label}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                <span className="inline-block mt-2 text-xs font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                  준비 중
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
