import axios from 'axios';
import { CalendarEvent, ReservationPayload } from '../types/calendar';

const API_BASE = process.env.REACT_APP_API_BASE || '';

export async function fetchCalendar(start?: string, end?: string): Promise<CalendarEvent[]> {
  const url = `${API_BASE}/api/calendar${start && end ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : ''}`;
  const resp = await axios.get(url);
  return resp.data;
}

export async function createReservation(payload: ReservationPayload): Promise<any> {
  const url = `${API_BASE}/api/reservations`;
  const resp = await axios.post(url, payload);
  return resp.data;
}

export async function cancelReservation(reservationId: string | number): Promise<void> {
  const url = `${API_BASE}/api/reservations/${reservationId}`;
  await axios.delete(url);
}
