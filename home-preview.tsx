import React from 'react';
import ReactDOM from 'react-dom/client';
import { CoachHomeGreenReading } from './components/CoachHomeGreenReading';
import { LanguageProvider } from './components/LanguageContext';
import { CoachProfile, ClientProfile, Lesson } from './types';
import './index.css';

const today = new Date();
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const mockCoach: CoachProfile = {
  id: 'preview-coach',
  name: 'Samuelson',
  email: 'preview@coachx.ai',
  isSubscribed: true,
  subscriptionPlan: 'PRO',
  subscriptionEndDate: '2099-12-31',
};

const mockClients: ClientProfile[] = [
  { id: 'c1', name: '박지훈', phone: '010-1000-0001' },
  { id: 'c2', name: '이도윤', phone: '010-1000-0002' },
  { id: 'c3', name: '최서연', phone: '010-1000-0003' },
  { id: 'c4', name: '정하은', phone: '010-1000-0004' },
  { id: 'c5', name: '김민석', phone: '010-1000-0005' },
  { id: 'c6', name: '한지원', phone: '010-1000-0006' },
  { id: 'c7', name: '오세훈', phone: '010-1000-0007' },
  { id: 'c8', name: '유나영', phone: '010-1000-0008' },
  { id: 'c9', name: '문지훈', phone: '010-1000-0009' },
  { id: 'c10', name: '강태윤', phone: '010-1000-0010' },
  { id: 'c11', name: '홍서진', phone: '010-1000-0011' },
  { id: 'c12', name: '노예린', phone: '010-1000-0012' },
];

const makeLesson = (
  id: string,
  name: string,
  time: string,
  date: string,
  title: string,
  tags: string[]
): Lesson & { time: string } => ({
  id,
  clientName: name,
  clientPhone: '010-0000-0000',
  createdBy: 'COACH',
  date,
  title,
  videoUrl: '',
  mediaType: 'video',
  coachNotes: '',
  tags,
  recordType: 'LESSON',
  time,
  aiAnalysis: id === 'today-2' ? '자세 분석 완료' : undefined,
} as Lesson & { time: string });

const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(today.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const mockLessons: Lesson[] = [
  makeLesson('today-1', '박지훈', '10:00', todayIso, '실내 스튜디오', ['스윙']),
  makeLesson('today-2', '이도윤', '13:30', todayIso, '파3 코스', ['필드']),
  makeLesson('today-3', '최서연', '16:00', todayIso, '드라이버', ['피팅']),
  makeLesson('today-4', '정하은', '18:00', todayIso, '실내 스튜디오', ['스윙']),
  makeLesson('w1', '박지훈', '10:00', daysAgo(1), '아이언', ['스윙']),
  makeLesson('w2', '김민석', '14:00', daysAgo(1), '드라이버', ['스윙']),
  makeLesson('w3', '한지원', '16:00', daysAgo(2), '퍼팅', ['스윙']),
  makeLesson('w4', '오세훈', '11:00', daysAgo(2), '어프로치', ['스윙']),
  makeLesson('w5', '유나영', '15:00', daysAgo(3), '파3 코스', ['필드']),
  makeLesson('w6', '문지훈', '10:00', daysAgo(3), '아이언', ['스윙']),
  makeLesson('w7', '강태윤', '14:00', daysAgo(4), '드라이버', ['스윙']),
  makeLesson('w8', '홍서진', '16:00', daysAgo(4), '피팅', ['피팅']),
  makeLesson('w9', '노예린', '11:00', daysAgo(5), '아이언', ['스윙']),
  makeLesson('m1', '박지훈', '10:00', daysAgo(10), '스윙', ['스윙']),
  makeLesson('m2', '이도윤', '14:00', daysAgo(12), '필드', ['필드']),
];

const Root: React.FC = () => (
  <LanguageProvider>
    <CoachHomeGreenReading
      coachProfile={mockCoach}
      allLessons={mockLessons}
      clients={mockClients}
      onBack={() => alert('onBack — 실앱에서는 대시보드로 이동')}
      onOpenChat={(q) => alert(`onOpenChat("${q ?? ''}") — 실앱에서는 챗 화면 오픈`)}
    />
  </LanguageProvider>
);

const el = document.getElementById('home-preview-root');
if (el) {
  ReactDOM.createRoot(el).render(<Root />);
}
