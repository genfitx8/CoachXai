# 캘린더 기능 통합 가이드

이 분기는 캘린더 UI(FullCalendar)와 간단한 리얼타임/예약 API 통합 스캐폴딩을 제공합니다.

설치(로컬)

1. 의존성 설치

```
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction socket.io-client axios
```

2. 환경 변수

- REACT_APP_API_BASE — 예약/캘린더 API의 베이스 URL (예: https://api.example.com)
- REACT_APP_SOCKET_URL — Socket.IO 서버 URL (예: https://realtime.example.com)

3. 사용법

- 컴포넌트: `components/CalendarView.tsx` 를 import 후 원하는 위치에 렌더링하세요.

```tsx
import CalendarView from './components/CalendarView';

function Page() {
  return <CalendarView />;
}
```

4. 백엔드 엔드포인트(예시)

- GET /api/calendar?start=&end= — 기간 내 이벤트 배열 반환
- POST /api/reservations — 예약 생성, body: ReservationPayload
- DELETE /api/reservations/:id — 예약 취소
- Socket channel: emit on channel name `calendar` with payload: { action: 'create'|'update'|'delete', event }

5. 테스트

- 프론트: 기본 동작(e2e 또는 수동) 확인

```
# 앱 실행
npm start
```
