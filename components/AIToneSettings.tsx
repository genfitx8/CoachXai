import React, { useState } from 'react';
import { X, Sparkles, Zap, Minus, Check } from 'lucide-react';
import { AITone, ClientProfile } from '../types';
import { useLanguage } from './LanguageContext';

interface AIToneSettingsProps {
  open: boolean;
  onClose: () => void;
  profile: ClientProfile;
  onSave: (updated: ClientProfile) => void;
}

interface ToneOption {
  key: AITone;
  icon: React.ComponentType<{ className?: string }>;
  ko: { label: string; desc: string; sample: string };
  en: { label: string; desc: string; sample: string };
  ja: { label: string; desc: string; sample: string };
}

const TONE_OPTIONS: ToneOption[] = [
  {
    key: 'friendly',
    icon: Sparkles,
    ko: {
      label: '친근한 톤',
      desc: '따뜻하고 격려하는 스타일',
      sample: '"오늘 컨디션 어때요? 어제 잘 됐던 것부터 얘기해봐요 😊"',
    },
    en: {
      label: 'Friendly',
      desc: 'Warm and encouraging',
      sample: '"How are you feeling today? Let\'s start with what went well 😊"',
    },
    ja: {
      label: 'フレンドリー',
      desc: '温かく励ますスタイル',
      sample: '"今日の調子はどうですか？昨日良かったことから話しましょう 😊"',
    },
  },
  {
    key: 'coach',
    icon: Zap,
    ko: {
      label: '코치 톤',
      desc: '직설적이고 코치처럼',
      sample: '"어제 슬라이스 원인 정확히 말해줄게요. 백스윙 오버가 문제입니다."',
    },
    en: {
      label: 'Coach',
      desc: 'Direct, coach-like feedback',
      sample: '"Let\'s pinpoint yesterday\'s slice. The root cause is an over-swing at the top."',
    },
    ja: {
      label: 'コーチ',
      desc: '直接的でコーチのように',
      sample: '"昨日のスライスの原因ははっきりしています。トップでのオーバースイングです。"',
    },
  },
  {
    key: 'minimal',
    icon: Minus,
    ko: {
      label: '미니멀 톤',
      desc: '짧고 데이터 위주',
      sample: '"드라이버 3라운드 슬라이스 5회. 백스윙 오버 지속. 다음 연습: 하프스윙."',
    },
    en: {
      label: 'Minimal',
      desc: 'Short, data-first',
      sample: '"Driver: 5 slices over 3 rounds. Over-swing persists. Next drill: half swing."',
    },
    ja: {
      label: 'ミニマル',
      desc: '短くデータ重視',
      sample: '"ドライバー3ラウンドでスライス5回。オーバースイング継続。次: ハーフスイング。"',
    },
  },
];

export const AIToneSettings: React.FC<AIToneSettingsProps> = ({
  open,
  onClose,
  profile,
  onSave,
}) => {
  const { language } = useLanguage();
  const lang = (language as 'ko' | 'en' | 'ja') ?? 'ko';
  const [selected, setSelected] = useState<AITone>(profile.aiTone ?? 'friendly');

  if (!open) return null;

  const heading = lang === 'ko' ? 'AI 톤 설정'
    : lang === 'ja' ? 'AIトーン設定'
    : 'AI tone';

  const subheading = lang === 'ko' ? 'CoachX AI가 대화하는 방식을 골라주세요.'
    : lang === 'ja' ? 'CoachX AIの話し方を選んでください。'
    : 'Pick how CoachX AI talks with you.';

  const saveLabel = lang === 'ko' ? '저장'
    : lang === 'ja' ? '保存'
    : 'Save';

  const cancelLabel = lang === 'ko' ? '취소'
    : lang === 'ja' ? 'キャンセル'
    : 'Cancel';

  const handleSave = () => {
    onSave({ ...profile, aiTone: selected });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full sm:max-w-md bg-[#0A0F1A] border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-300/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-100">{heading}</h2>
            <p className="text-xs text-slate-400">{subheading}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 space-y-2">
          {TONE_OPTIONS.map(opt => {
            const isSelected = selected === opt.key;
            const Icon = opt.icon;
            const t = opt[lang];
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                className={`w-full text-left rounded-2xl p-4 border transition-colors ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-400/60'
                    : 'bg-slate-900/70 border-slate-800 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                    isSelected ? 'bg-indigo-500/30 border-indigo-400/50' : 'bg-slate-800 border-slate-700'
                  }`}>
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-100' : 'text-slate-300'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-100">{t.label}</p>
                    <p className="text-xs text-slate-400">{t.desc}</p>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-indigo-200 flex-shrink-0" />
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-300 italic leading-relaxed">{t.sample}</p>
              </button>
            );
          })}
        </div>

        <footer className="px-4 pb-6 pt-2 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-200 text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            {saveLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};
