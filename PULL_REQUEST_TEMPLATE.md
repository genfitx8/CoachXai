## 문제
구글 캘린더 연동 시 사용자에게 "구글 캘린더 연동에 실패했습니다"라는 일반적인 에러만 표시되어, 원인을 파악하기 어려움.

## 개선 사항

### 1) googleCalendarService.ts 개선
- gapi.load() 및 gapi.client.init() 에러 처리 강화
- 환경변수 (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY) 검증 강화
- gapi.auth2.getAuthInstance() null 체크 추가
- 상세한 console 로깅 추가 (디버깅용)
- GAPI 로드 타임아웃 처리

### 2) GoogleCalendarModal.tsx 개선
- 명확한 에러 메시지 분기:
  - 환경변수 미설정: "Google API 설정이 필요합니다."
  - 네트워크 오류: "구글 API 로드 실패. 인터넷 연결을 확인하세요."
  - OAuth 오류: 구체적인 Google 에러 메시지
- 재시도 버튼 제공

### 3) .env.example 업데이트
- Google OAuth 필수 환경변수 문서화:
  - VITE_GOOGLE_CLIENT_ID
  - VITE_GOOGLE_API_KEY
  - VITE_GOOGLE_REDIRECT_URI

### 4) 안정성 개선
- 구글 캘린더 연동 실패 시 앱 전체가 다운되지 않도록 처리
- console에 상세 에러 로그 출력 (개발자 디버깅용)