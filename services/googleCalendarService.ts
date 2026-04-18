import { gapi } from 'gapi-script';

interface GoogleCalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string }[];
}

class GoogleCalendarService {
  private clientId: string;
  private apiKey: string;
  private scopes = ['https://www.googleapis.com/auth/calendar'];
  private isInitialized = false;

  constructor() {
    this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    this.apiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';
  }

  /**
   * Initialize GAPI client
   */
  async initClient(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.clientId || !this.apiKey) {
      throw new Error('Google Calendar API configuration is required');
    }

    return new Promise((resolve, reject) => {
      gapi.load('client:auth2', async () => {
        try {
          await gapi.client.init({
            apiKey: this.apiKey,
            clientId: this.clientId,
            discoveryDocs: [
              'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
            ],
            scope: this.scopes.join(' '),
          });
          this.isInitialized = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * OAuth 인증 시작
   */
  async initiateAuth(): Promise<void> {
    await this.initClient();
    const auth = gapi.auth2.getAuthInstance();
    
    if (!auth.isSignedIn.get()) {
      await auth.signIn();
    }
  }

  /**
   * 현재 로그인 상태 확인
   */
  isSignedIn(): boolean {
    if (!this.isInitialized) return false;
    const auth = gapi.auth2.getAuthInstance();
    return auth && auth.isSignedIn.get();
  }

  /**
   * 로그아웃
   */
  async signOut(): Promise<void> {
    if (!this.isInitialized) return;
    const auth = gapi.auth2.getAuthInstance();
    if (auth) {
      await auth.signOut();
    }
  }

  /**
   * 액세스 토큰 가져오기
   */
  getAccessToken(): string | null {
    if (!this.isInitialized) return null;
    const auth = gapi.auth2.getAuthInstance();
    const user = auth?.currentUser?.get();
    return user?.getAuthResponse()?.access_token || null;
  }

  /**
   * 일정 생성
   */
  async createEvent(
    calendarId: string,
    event: GoogleCalendarEvent
  ): Promise<any> {
    await this.initClient();
    
    const response = await gapi.client.request({
      path: `/calendar/v3/calendars/${calendarId}/events`,
      method: 'POST',
      body: event,
    });

    return response.result;
  }

  /**
   * 일정 업데이트
   */
  async updateEvent(
    calendarId: string,
    eventId: string,
    event: GoogleCalendarEvent
  ): Promise<any> {
    await this.initClient();
    
    const response = await gapi.client.request({
      path: `/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      method: 'PUT',
      body: event,
    });

    return response.result;
  }

  /**
   * 일정 삭제
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.initClient();
    
    await gapi.client.request({
      path: `/calendar/v3/calendars/${calendarId}/events/${eventId}`,
      method: 'DELETE',
    });
  }

  /**
   * 일정 목록 가져오기
   */
  async listEvents(
    calendarId: string = 'primary',
    timeMin?: string,
    timeMax?: string
  ): Promise<any[]> {
    await this.initClient();
    
    const params: any = {
      calendarId,
      timeMin: timeMin || new Date().toISOString(),
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    };

    if (timeMax) {
      params.timeMax = timeMax;
    }

    const response = await gapi.client.request({
      path: `/calendar/v3/calendars/${calendarId}/events`,
      method: 'GET',
      params,
    });

    return response.result.items || [];
  }

  /**
   * 사용자 캘린더 목록 가져오기
   */
  async listCalendars(): Promise<any[]> {
    await this.initClient();
    
    const response = await gapi.client.request({
      path: '/calendar/v3/users/me/calendarList',
      method: 'GET',
    });

    return response.result.items || [];
  }
}

export const googleCalendarService = new GoogleCalendarService();
