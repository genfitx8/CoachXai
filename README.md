<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🏌️ SwingNote - 스마트 골프 레슨 관리 플랫폼

**SwingNote - Smart Golf Lesson Management Platform**

[![React](https://img.shields.io/badge/React-19.2.0-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2.0-purple.svg)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-12.6.0-orange.svg)](https://firebase.google.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.1.18-teal.svg)](https://tailwindcss.com/)

</div>

## 📖 목차 (Table of Contents)

- [소개 (Introduction)](#-소개-introduction)
- [주요 기능 (Key Features)](#-주요-기능-key-features)
- [기술 스택 (Tech Stack)](#-기술-스택-tech-stack)
- [시작하기 (Getting Started)](#-시작하기-getting-started)
- [사용자 가이드 (User Guide)](#-사용자-가이드-user-guide)
- [고급 기능 (Advanced Features)](#-고급-기능-advanced-features)
- [아키텍처 (Architecture)](#-아키텍처-architecture)
- [문제 해결 (Troubleshooting)](#-문제-해결-troubleshooting)
- [기여하기 (Contributing)](#-기여하기-contributing)
- [라이선스 (License)](#-라이선스-license)

---

## 🎯 소개 (Introduction)

**SwingNote**는 골프 코치와 학생을 위한 최첨단 레슨 관리 플랫폼입니다. AI 기반 스윙 분석, 비디오 편집, 실시간 피드백, 포인트 시스템을 통해 골프 레슨의 효율성을 극대화합니다.

**SwingNote** is a cutting-edge lesson management platform for golf coaches and students. It maximizes the efficiency of golf lessons through AI-powered swing analysis, video editing, real-time feedback, and a point system.

### 💡 왜 SwingNote인가? (Why SwingNote?)

- 🎥 **비디오 기반 레슨**: 스윙을 녹화하고 프레임별로 분석
- 🤖 **AI 스윙 분석**: Google Gemini API를 활용한 자동 스윙 분석 및 피드백
- ✂️ **전문 영상 편집**: 영상 자르기, 음성 녹음, 그리기 도구 내장
- 📊 **데이터 추적**: 런치 모니터 데이터, 스코어, 진행 상황 추적
- 📅 **예약 시스템**: 통합 캘린더 및 Google Calendar 연동
- 💰 **포인트 시스템**: 숙제 완료, 출석 등에 대한 보상 시스템
- 🌐 **다국어 지원**: 한국어/영어 인터페이스

---

## ✨ 주요 기능 (Key Features)

### 👨‍🏫 코치 기능 (Coach Features)

#### 📹 레슨 기록 및 관리
- 비디오/이미지/오디오로 레슨 기록
- 코치 노트, 태그, 클럽 정보 추가
- AI 기반 자동 스윙 분석 및 피드백
- 런치 모니터 데이터 입력 및 시각화
- 스윙 시퀀스 이미지 추출 (Address, Top, Impact, Finish)

#### ✂️ 비디오 편집 도구
- **영상 자르기**: 정밀한 타임라인 컨트롤 (0.01초 단위)
- **음성 녹음**: 영상에 음성 해설 추가
- **그리기 도구**: 스윙 폼 분석을 위한 선, 화살표, 도형 그리기
- FFmpeg.js 기반 브라우저 내 영상 처리

#### 👥 학생 관리
- 학생 프로필 관리 (이름, 전화번호, 골프 정보)
- 레슨 히스토리 추적
- 숙제 할당 및 진행 상황 모니터링
- 포인트 지급 및 관리

#### 📅 예약 관리
- FullCalendar 기반 인터랙티브 캘린더
- 실시간 예약 동기화
- Google Calendar 통합
- 모바일 최적화 (반응형 디자인)

### 👨‍🎓 학생 기능 (Student Features)

#### 📚 레슨 히스토리
- 자신의 모든 레슨 기록 보기
- 비디오, 코치 노트, AI 분석 확인
- 스윙 비교 (이전 레슨과 비교)
- 레슨별 태그 및 검색

#### 📝 개인 피드백
- 각 레슨에 텍스트/음성 피드백 추가
- 개인 메모 작성
- 학습 목표 설정

#### 🎯 숙제 시스템
- 할당된 숙제 확인
- 완료 시 자동 포인트 적립
- 진행 상황 추적

#### 📊 통계 및 진행 상황
- 레슨 통계 (총 레슨 수, 평균 점수 등)
- 스코어 추적 및 시각화
- 골프 데이터 분석 (Carry, Ball Speed, Launch Angle 등)
- 월별/분기별 진행 상황 차트

#### 💰 포인트 시스템
- 숙제 완료: 50 포인트
- 레슨 녹화: 100 포인트
- 출석: 10 포인트
- 포인트 히스토리 확인

#### 📅 예약하기
- 코치 검색 및 선택
- 실시간 일정 확인
- 예약 생성 및 취소
- Google Calendar 연동

### 🔐 관리자 기능 (Admin Features)

- 전체 사용자 관리
- 코스 관리
- 시스템 설정
- Firebase 구성

---

## 🛠️ 기술 스택 (Tech Stack)

### Frontend
- **React 19.2.0** - UI 프레임워크
- **TypeScript 5.8.2** - 타입 안정성
- **Vite 6.2.0** - 빠른 빌드 도구
- **Tailwind CSS 4.1.18** - 유틸리티 우선 CSS 프레임워크
- **Lucide React** - 아이콘 라이브러리

### 비디오 처리 (Video Processing)
- **FFmpeg.js** - 브라우저 내 비디오 편집
- **Fabric.js 5.5.2** - 캔버스 드로잉

### AI 및 분석 (AI & Analytics)
- **Google Generative AI (Gemini)** - AI 스윙 분석
- **Recharts 2.15.0** - 데이터 시각화

### 백엔드 및 저장소 (Backend & Storage)
- **Firebase 12.6.0**
  - Firestore - 실시간 데이터베이스
  - Storage - 파일 저장소
  - Authentication (Optional)
- **localStorage** - 오프라인 모드

### 캘린더 및 예약 (Calendar & Booking)
- **FullCalendar 6.1.20** - 인터랙티브 캘린더
- **Socket.io-client** - 실시간 통신
- **Google Calendar API** - 캘린더 통합
- **ICS 3.8.1** - 캘린더 파일 생성

---

## 🚀 시작하기 (Getting Started)

### 필수 조건 (Prerequisites)

- **Node.js** (v18 이상 권장)
- **npm** 또는 **yarn**
- **(선택사항)** Firebase 프로젝트
- **(선택사항)** Google Gemini API 키

### 설치 (Installation)

1. **저장소 클론**
   ```bash
   git clone https://github.com/genfitx8/swingnote.git
   cd swingnote
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경 변수 설정**
   
   프로젝트 루트에 `.env` 파일을 생성하고 다음을 추가하세요:

   ```env
   # Gemini API (AI 분석용 - 선택사항)
   GEMINI_API_KEY=your_gemini_api_key_here

   # Firebase 구성 (선택사항 - 미설정 시 로컬 스토리지 모드)
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

   **참고**: Firebase 구성이 없으면 앱은 자동으로 로컬 스토리지 모드로 전환됩니다.

4. **개발 서버 실행**
   ```bash
   npm run dev
   ```

5. **브라우저에서 열기**
   
   http://localhost:3000 으로 이동

### 프로덕션 빌드 (Production Build)

```bash
npm run build
npm run preview
```

---

## 📚 사용자 가이드 (User Guide)

### 첫 로그인 (First Login)

1. **코치로 시작**
   - "코치 시작하기" 클릭
   - 프로필 설정 (이름, 전문 분야, 자격증 등)
   
2. **학생으로 시작**
   - "학생 시작하기" 클릭
   - 프로필 설정 (이름, 전화번호, 골프 레벨 등)

### 코치: 첫 레슨 기록하기

1. **"레슨 시작하기"** 클릭
2. 학생 정보 입력
   - 이름 및 전화번호 (신규 학생)
   - 또는 기존 학생 선택
3. 레슨 정보 입력
   - 제목
   - 사용한 클럽 (예: "7 Iron", "Driver")
   - 스윙 각도 (정면/측면)
4. **비디오 녹화 또는 업로드**
5. (선택사항) 코치 노트 작성
6. (선택사항) AI 분석 요청
7. (선택사항) 런치 모니터 데이터 입력
8. **저장**

### 코치: 비디오 편집

1. 레슨 상세 페이지에서 **"영상 편집"** 클릭
2. 편집 모드 선택:
   - **영상 자르기**: 슬라이더로 시작/종료 지점 설정
   - **음성 녹음**: 마이크로 음성 해설 추가
   - **선 긋기**: 스윙 폼에 선, 화살표, 도형 그리기
3. 편집 적용
4. 자동으로 Firebase에 저장

### 학생: 레슨 확인 및 피드백

1. 대시보드에서 **최근 레슨** 확인
2. 레슨 클릭하여 상세 보기
3. 비디오 재생 및 코치 노트 확인
4. **피드백 추가** 버튼으로 개인 메모 작성
5. 숙제 확인 및 완료 표시 (포인트 자동 적립)

### 예약 시스템 사용

#### 코치
1. **"예약 관리"** 클릭
2. 캘린더에서 일정 확인
3. 학생 예약 승인/거부

#### 학생
1. **"예약하기"** 클릭
2. 코치 검색
3. 코치 선택 후 캘린더 확인
4. 원하는 시간 클릭하여 예약
5. Google Calendar 동기화 (선택사항)

---

## 🔥 고급 기능 (Advanced Features)

### AI 스윙 분석

SwingNote는 Google Gemini API를 사용하여 자동으로 스윙을 분석합니다:

- **자세 분석**: Address, Backswing, Impact, Follow-through
- **개선 제안**: AI가 생성한 구체적인 피드백
- **런치 데이터 추출**: 비디오에서 런치 모니터 데이터 자동 추출
- **스윙 시퀀스**: 주요 순간 자동 캡처

### 비디오 편집 상세

자세한 비디오 편집 가이드는 [VIDEO_EDITING_GUIDE.md](VIDEO_EDITING_GUIDE.md)를 참조하세요.

**지원되는 편집:**
- 영상 자르기 (Trimming)
- 음성 오버레이 (Audio Overlay)
- 그리기 주석 (Drawing Annotations)

**기술 세부사항:**
- FFmpeg.js WebAssembly
- 브라우저 내 처리 (서버 불필요)
- MP4 출력 형식
- 품질 손실 없음

### 캘린더 통합

자세한 캘린더 가이드는 [docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md)를 참조하세요.

**기능:**
- FullCalendar 기반 UI
- 실시간 예약 동기화 (Socket.io)
- Google Calendar 양방향 동기화
- ICS 파일 내보내기
- 모바일 반응형 디자인

**모바일 최적화:**
- 작은 화면에서 일간 뷰로 시작
- 터치 친화적 인터페이스
- 간소화된 툴바

### 포인트 시스템

포인트는 다음과 같이 적립됩니다:

| 활동 | 포인트 |
|------|--------|
| 숙제 완료 | 50 |
| 레슨 녹화 | 100 |
| 출석 | 10 |

포인트는 향후 보상, 할인, 이벤트 참여 등에 사용될 수 있습니다.

### 스윙 비교

여러 레슨의 스윙 비디오를 나란히 비교:

1. 레슨 목록에서 **두 개의 레슨 선택**
2. **"스윙 비교"** 클릭
3. 동기화된 재생으로 개선 사항 확인

---

## 🏗️ 아키텍처 (Architecture)

### 디렉토리 구조

```
swingnote/
├── components/           # React 컴포넌트
│   ├── AdminDashboard.tsx
│   ├── AuthScreen.tsx
│   ├── CalendarView.tsx
│   ├── ClientApp.tsx
│   ├── ClientStats.tsx
│   ├── CoachClientManager.tsx
│   ├── DrawingCanvas.tsx
│   ├── LessonCard.tsx
│   ├── LessonDetail.tsx
│   ├── NewLessonForm.tsx
│   ├── VideoEditor.tsx
│   └── ...
├── services/             # 비즈니스 로직 서비스
│   ├── authService.ts
│   ├── firebase.ts
│   ├── geminiService.ts
│   ├── pointService.ts
│   ├── storage.ts
│   ├── videoEditingService.ts
│   └── drawingService.ts
├── types/                # TypeScript 타입 정의
│   └── types.ts
├── utils/                # 유틸리티 함수
├── docs/                 # 추가 문서
│   └── CALENDAR_INTEGRATION.md
├── App.tsx               # 메인 앱 컴포넌트
├── index.tsx             # 엔트리 포인트
├── index.css             # 글로벌 스타일
├── vite.config.ts        # Vite 설정
├── tailwind.config.js    # Tailwind 설정
└── package.json          # 프로젝트 메타데이터
```

### 데이터 모델

주요 데이터 타입은 `types.ts`에 정의되어 있습니다:

- **Lesson**: 레슨 기록 (비디오, 노트, 분석 등)
- **ClientProfile**: 학생 정보
- **CoachProfile**: 코치 정보
- **Homework**: 숙제 할당
- **PointTransaction**: 포인트 거래 내역
- **Reservation**: 예약 정보
- **GolfData**: 런치 모니터 데이터
- **ScorecardDetail**: 스코어 카드

### 저장소 전략

**Firebase 모드** (기본):
- Firestore: 레슨, 프로필, 예약 데이터
- Storage: 비디오, 이미지, 오디오 파일

**로컬 스토리지 모드** (Firebase 미설정 시):
- localStorage: JSON 데이터
- Blob URLs: 미디어 파일 (세션 동안만 유지)

### 상태 관리

- React Hooks (useState, useEffect, useMemo)
- Context API (언어 설정)
- 컴포넌트 간 Props 전달

---

## 🐛 문제 해결 (Troubleshooting)

### Firebase 초기화 실패

**문제**: "Firebase 초기화 실패" 오류
**해결책**: 
1. `.env` 파일의 Firebase 설정 확인
2. Firebase 콘솔에서 웹 앱 키 재생성
3. 또는 로컬 스토리지 모드로 사용 (Firebase 설정 제거)

### FFmpeg 초기화 실패

**문제**: 비디오 편집 시 "Failed to initialize FFmpeg" 오류
**해결책**:
1. 브라우저 콘솔에서 WebAssembly 에러 확인
2. 브라우저가 최신 버전인지 확인 (Chrome 90+, Firefox 88+)
3. CORS 설정 확인 (CDN에서 로드 시)

### 마이크 권한 거부

**문제**: 음성 녹음이 작동하지 않음
**해결책**:
1. 브라우저 설정에서 마이크 권한 허용
2. HTTPS로 앱 서빙 확인 (MediaRecorder API 요구사항)

### 대용량 파일 업로드 실패

**문제**: 비디오 업로드 타임아웃
**해결책**:
1. 파일 크기 확인 (100MB 이하 권장)
2. Firebase Storage CORS 규칙 설정
3. 청크 업로드 구현 고려

### 모바일 성능 이슈

**문제**: 모바일에서 비디오 편집이 느림
**해결책**:
1. 대용량 비디오는 데스크톱에서 편집
2. 비디오 해상도 낮추기
3. 서버 측 처리 고려

---

## 📱 모바일 지원

SwingNote는 반응형 디자인으로 모바일 기기를 완벽하게 지원합니다.

**최적화된 기능:**
- 터치 친화적 UI
- 반응형 캘린더 (모바일에서 일간 뷰)
- 모바일 비디오 녹화
- 터치 제스처 지원

**테스트된 기기:**
- iOS (Safari 14.1+)
- Android (Chrome 90+)
- 태블릿 (iPad, Galaxy Tab)

모바일 최적화 세부사항은 [MOBILE_OPTIMIZATION_SUMMARY.md](MOBILE_OPTIMIZATION_SUMMARY.md)를 참조하세요.

---

## 🤝 기여하기 (Contributing)

SwingNote는 오픈 소스 프로젝트입니다! 기여를 환영합니다.

### 기여 방법

1. **Fork** 저장소
2. **Feature 브랜치** 생성 (`git checkout -b feature/AmazingFeature`)
3. **변경사항 커밋** (`git commit -m 'Add some AmazingFeature'`)
4. **브랜치에 Push** (`git push origin feature/AmazingFeature`)
5. **Pull Request** 생성

### 개발 가이드라인

- TypeScript 타입 사용
- Tailwind CSS 유틸리티 클래스 사용
- 컴포넌트 재사용성 고려
- 주석과 문서 작성
- 코드 리뷰 참여

---

## 📄 라이선스 (License)

이 프로젝트의 라이선스는 저장소에 별도로 명시되어 있지 않습니다. 사용 전 프로젝트 소유자에게 문의하세요.

---

## 📞 지원 및 연락 (Support & Contact)

- **GitHub Issues**: [Issues 페이지](https://github.com/genfitx8/swingnote/issues)
- **AI Studio**: [앱 보기](https://ai.studio/apps/drive/13GzuTDTTZ6zf_mCdHkHCpE7fPpABTSth)

---

## 🌟 감사의 말 (Acknowledgments)

- **Google Gemini** - AI 분석
- **Firebase** - 백엔드 인프라
- **FullCalendar** - 캘린더 UI
- **FFmpeg.js** - 비디오 처리
- **Fabric.js** - 캔버스 드로잉
- **Lucide** - 아이콘 라이브러리

---

<div align="center">

**SwingNote와 함께 골프 실력을 향상시키세요! ⛳**

**Improve your golf skills with SwingNote! ⛳**

Made with ❤️ by the SwingNote Team

</div>
