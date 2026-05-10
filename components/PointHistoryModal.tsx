
import React, { useEffect, useState } from 'react';
import { PointTransaction, ClientProfile } from '../types';
import { pointService } from '../services/pointService';
import { X, ShoppingBag, Coins, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { createLogger } from '../utils/logger';

const log = createLogger('pointHistoryModal');

interface PointHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientProfile;
}

export const PointHistoryModal: React.FC<PointHistoryModalProps> = ({ isOpen, onClose, client }) => {
  const [history, setHistory] = useState<PointTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await pointService.getHistory(client);
      setHistory(data);
    } catch (e) {
      log.error("Failed to load point history", e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-400 to-orange-500 px-6 py-6 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 rounded-full p-1">
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
                <Coins className="w-8 h-8 text-white" />
            </div>
            <div>
                <p className="text-yellow-100 text-xs font-bold uppercase tracking-wider">My Rewards</p>
                <h2 className="text-3xl font-bold">{client.currentPoints?.toLocaleString() || 0} P</h2>
            </div>
          </div>
          <p className="text-white/90 text-sm">적립된 포인트는 레슨비 결제나 쇼핑몰에서 사용하세요!</p>
        </div>

        {/* Action Button */}
        <div className="p-4 border-b border-gray-100">
            <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); alert("준비 중인 기능입니다 (쇼핑몰 연동 예정)"); }}
                className="flex items-center justify-center gap-2 w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors shadow-lg shadow-gray-200"
            >
                <ShoppingBag className="w-5 h-5" /> 포인트몰 바로가기
            </a>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50">
            <h3 className="text-sm font-bold text-gray-500 mb-3 px-2">최근 내역</h3>
            
            {isLoading ? (
                <div className="text-center py-10 text-gray-400">불러오는 중...</div>
            ) : history.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">아직 적립된 포인트가 없습니다.</div>
            ) : (
                <div className="space-y-3">
                    {history.map(item => (
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <div className={`mt-1 p-2 rounded-full ${item.amount > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                    {item.amount > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">{item.description}</p>
                                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(item.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <span className={`font-bold text-lg ${item.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {item.amount > 0 ? '+' : ''}{item.amount.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
