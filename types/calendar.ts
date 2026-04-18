export interface CalendarEvent {
  id: number | string;
  title: string;
  start_time: string;
  end_time: string;
  type?: 'lesson' | 'reservation';
  [key: string]: any;
}

export interface ReservationPayload {
  lesson_id: number | null;
  user_id: number | null;
  start_time: string;
  end_time: string;
  title?: string;
}
