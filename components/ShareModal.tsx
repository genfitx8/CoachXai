import React from 'react';
import { Button } from './Button';
import { Send, Sparkles, Video, CheckCircle, X } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  clientName: string;
  onClose: () => void;
  onConfirm: (option: 'MEDIA_ONLY' | 'FULL') => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, clientName, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl scale-100 transition-transform">
        <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Send className="w-5 h-5" /> 회원앱으로 전송 설정
          </h3>
          <button onClick={onClose} className="hover:bg-emerald-700 p-1 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          <p className="text-gray-600 mb-6 text-center">
            <span className="font-bold text-gray-900">{clientName}</span> 회원님에게 어떤 내용을 보내시겠습니까?
          </p>

          <div className="grid gap-4">
            <button 
              onClick={() => onConfirm('MEDIA_ONLY')}
              className="flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all group text-left"
            >
              <div className="bg-gray-100 p-3 rounded-full text-gray-600 group-hover:bg-emerald-200 group-hover:text-emerald-700 mr-4">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">미디어만 전송</h4>
                <p className="text-sm text-gray-500">영상, 사진, 음성 녹음 및 코치 메모만 보냅니다.</p>
              </div>
            </button>

            <button 
              onClick={() => onConfirm('FULL')}
              className="flex items-center p-4 border-2 border-gray-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all group text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">
                RECOMMENDED
              </div>
              <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 group-hover:bg-emerald-200 group-hover:text-emerald-800 mr-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900">AI 분석 포함 전체 전송</h4>
                <p className="text-sm text-gray-500">AI가 분석한 스윙 교정 및 피드백 내용까지 모두 보냅니다.</p>
              </div>
            </button>
          </div>
        </div>
        
        <div className="bg-gray-50 px-6 py-4 text-center text-xs text-gray-500">
          전송 후에도 설정에서 변경할 수 있습니다.
        </div>
      </div>
    </div>
  );
};
