# 캘린더 기능 통합 가이드

SwingNote는 다양한 외부 캘린더 서비스와 연동하여 레슨 일정을 동기화하고 관리할 수 있습니다.

## 주요 기능

### 1. 구글 캘린더 연동
- OAuth 2.0 기반 안전한 인증
- 레슨 일정 자동 동기화
- 양방향 동기화 지원 (내보내기/가져오기/양방향)
- 실시간 업데이트

### 2. iCal (.ics) 파일 내보내기
- 표준 iCalendar 형식 지원
- Apple 캘린더, Outlook, 기타 모든 캘린더 앱과 호환
- 단일 파일 다운로드

### 3. Webcal 구독
- 실시간 구독 URL 제공
- 캘린더 앱에서 자동 업데이트 수신
- 여러 기기에서 동시 동기화

## 설치 및 설정

### 1. 의존성 설치

```bash
npm install ics gapi-script
```

### 2. 구글 Calendar API 설정

#### Google Cloud Console 설정
1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "API 및 서비스" > "라이브러리"로 이동
4. "Google Calendar API" 검색 및 활성화
5. "사용자 인증 정보" 탭으로 이동
6. "사용자 인증 정보 만들기" > "OAuth 클라이언트 ID" 선택
7. 애플리케이션 유형: 웹 애플리케이션
8. 승인된 JavaScript 원본: `http://localhost:3000` (개발용)
9. 승인된 리디렉션 URI: `http://localhost:3000/auth/google/callback`

#### API 키 생성
1. "사용자 인증 정보 만들기" > "API 키" 선택
2. API 키 복사

### 3. 환경 변수 설정

`.env` 파일에 다음 설정 추가:

```env
# Google Calendar API
VITE_GOOGLE_CLIENT_ID=your_client_id_here
VITE_GOOGLE_API_KEY=your_api_key_here
VITE_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Calendar Subscription
VITE_CALENDAR_BASE_URL=https://your-domain.com/calendar
```

**중요**: 프로덕션 환경에서는 실제 도메인으로 변경해야 합니다.

## 사용 방법

### 코치 앱

1. 상단 헤더의 "캘린더 연동" 버튼 클릭
2. 연동할 캘린더 서비스 선택:
   - **구글 캘린더**: OAuth 인증 후 자동 동기화
   - **iCal**: .ics 파일 다운로드
   - **구독 URL**: URL 복사하여 캘린더 앱에 추가

### 회원 앱

1. 메인 화면의 "캘린더" 버튼 클릭
2. 동일한 방식으로 캘린더 연동

### 기능 설명

#### 구글 캘린더로 내보내기
- 모든 레슨 일정을 구글 캘린더로 자동 전송
- 레슨 정보 (제목, 시간, 노트) 포함

#### .ics 다운로드
- 현재 레슨 일정을 .ics 파일로 저장
- Apple 캘린더, Outlook 등에서 가져오기 가능

#### 구독 URL 복사
- 실시간 업데이트를 받을 수 있는 구독 URL
- 캘린더 앱의 "URL로 구독" 기능 사용

## API 구조

### 서비스

1. **icalService** (`services/icalService.ts`)
   - iCalendar 형식 파일 생성
   - .ics 다운로드 처리
   - 구독 URL 생성

2. **googleCalendarService** (`services/googleCalendarService.ts`)
   - Google Calendar API v3 연동
   - OAuth 인증 처리
   - 일정 CRUD 작업

3. **calendarIntegrationService** (`services/calendarIntegrationService.ts`)
   - 모든 캘린더 프로바이더 통합 관리
   - 동기화 로직 처리
   - 연동 설정 저장/조회

### 컴포넌트

1. **CalendarIntegration** (`components/CalendarIntegration.tsx`)
   - 메인 캘린더 연동 UI
   - 연동 상태 표시
   - 빠른 작업 버튼

2. **GoogleCalendarModal** (`components/GoogleCalendarModal.tsx`)
   - OAuth 인증 플로우
   - 캘린더 선택
   - 동기화 설정

3. **CalendarView** (`components/CalendarView.tsx`)
   - 캘린더 UI 표시
   - 내보내기 버튼 포함

## Firebase 연동

### Firestore 컬렉션

```
calendar_integrations/{integrationId}
  - id: string
  - userId: string
  - provider: 'GOOGLE' | 'APPLE' | 'OUTLOOK' | 'ICAL'
  - accessToken?: string
  - refreshToken?: string
  - expiresAt?: number
  - isActive: boolean
  - syncEnabled: boolean
  - lastSyncAt?: number
  - calendarId?: string
  - createdAt: number
  - updatedAt: number
```

### 동기화 로그

```
calendar_sync_logs/{logId}
  - integrationId: string
  - syncedAt: number
  - status: 'SUCCESS' | 'FAILED'
  - itemsSynced: number
  - errors?: string[]
```

## 보안 고려사항

1. **OAuth 토큰 관리**
   - 액세스 토큰과 리프레시 토큰을 안전하게 저장
   - 토큰 만료 시 자동 갱신
   - 로컬 스토리지에는 암호화된 형태로 저장 권장

2. **HTTPS 사용**
   - 프로덕션 환경에서는 반드시 HTTPS 사용
   - OAuth 리디렉션 URI도 HTTPS로 설정

3. **CORS 설정**
   - API 서버에서 적절한 CORS 헤더 설정
   - 허용된 도메인만 접근 가능하도록 제한

## 문제 해결

### "인증에 실패했습니다" 오류
- Google Cloud Console에서 OAuth 설정 확인
- 클라이언트 ID와 API 키가 올바른지 확인
- 리디렉션 URI가 정확히 일치하는지 확인

### 동기화가 안 됨
- 인터넷 연결 확인
- 구글 계정 로그인 상태 확인
- Firebase 초기화 상태 확인

### iCal 파일 다운로드 안 됨
- 브라우저의 팝업 차단 해제
- 다운로드 권한 확인

## 추가 개발 가능 기능

1. **Apple 캘린더 직접 연동**
   - CalDAV 프로토콜 사용
   - iCloud 계정 연동

2. **Outlook 캘린더 연동**
   - Microsoft Graph API 사용
   - OAuth 2.0 인증

3. **자동 동기화 스케줄러**
   - 백그라운드 동기화
   - 서비스 워커 활용

4. **충돌 해결 UI**
   - 양방향 동기화 시 충돌 감지
   - 사용자가 선택할 수 있는 UI 제공

## 참고 자료

- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [iCalendar RFC 5545](https://tools.ietf.org/html/rfc5545)
- [ics 라이브러리](https://github.com/adamgibbons/ics)
- [gapi-script](https://www.npmjs.com/package/gapi-script)

## 라이선스

이 기능은 SwingNote 프로젝트의 일부이며, 동일한 라이선스를 따릅니다.
