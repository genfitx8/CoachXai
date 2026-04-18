import React, { useEffect } from 'react';
import { Bell, X, CheckCircle2 } from 'lucide-react';

interface NotificationToastProps {
  title: string;
  message: string;
  visible: boolean;
  onClose: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  title,
  message,
  visible,
  onClose,
}) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onClose, 4000); // Display for 4 seconds
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);

  return (
    <div
      className={`fixed top-20 left-0 right-0 z-[50] flex justify-center px-4 pointer-events-none transition-all duration-500 transform ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'
      }`}
    >
      <div className="bg-white/90 backdrop-blur-xl shadow-2xl rounded-2xl p-4 flex items-center gap-4 w-full max-w-sm border border-white/40 pointer-events-auto ring-1 ring-emerald-500/10 animate-slide-in-up">
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/50 flex-shrink-0 animate-float">
          <Bell className="w-6 h-6 fill-current" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-900 text-sm leading-tight mb-0.5">
            {title}
          </h4>
          <p className="text-gray-600 text-xs truncate">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100/80 transition-all duration-200 hover:scale-110 transform"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
