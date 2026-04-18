import React, { useEffect, useState } from 'react';
import FullCalendar, { EventInput } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { fetchCalendar, createReservation, cancelReservation } from '../services/reservationApi';
import { realtimeSubscribe, realtimeUnsubscribe, realtimeConnect } from '../services/realtime';
import { CalendarEvent, ReservationPayload } from '../types/calendar';
import { icalService } from '../services/icalService';
import { Download, Link2, Calendar as CalendarIcon } from 'lucide-react';

const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = async (start?: string, end?: string) => {
    setLoading(true);
    try {
      const data = await fetchCalendar(start, end);
      const mapped: EventInput[] = (data || []).map((e: CalendarEvent) => ({
        id: String(e.id),
        title: e.title,
        start: e.start_time,
        end: e.end_time,
        extendedProps: e,
        backgroundColor: e.type === 'lesson' ? '#2563eb' : '#059669',
      }));
      setEvents(mapped);
    } catch (err) {
      console.error('failed to fetch calendar', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    const onEvent = (payload: any) => {
      if (!payload || !payload.event) return;
      const ev = payload.event as CalendarEvent;
      setEvents((prev) => {
        const filtered = prev.filter((p) => String((p as any).id) !== String(ev.id));
        if (payload.action === 'delete') return filtered;
        const newEv: EventInput = {
          id: String(ev.id),
          title: ev.title,
          start: ev.start_time,
          end: ev.end_time,
          extendedProps: ev,
          backgroundColor: ev.type === 'lesson' ? '#2563eb' : '#059669',
        };
        return [...filtered, newEv];
      });
    };

    realtimeSubscribe('calendar', onEvent);
    realtimeConnect();
    return () => {
      realtimeUnsubscribe('calendar', onEvent);
    };
  }, []);

  const handleDateSelect = async (selectInfo: any) => {
    const title = window.prompt('예약할 레슨 이름을 입력하세요 (예: 초급반)');
    if (!title) return;

    const payload: ReservationPayload = {
      lesson_id: null,
      user_id: null,
      start_time: selectInfo.startStr,
      end_time: selectInfo.endStr,
      title,
    };

    try {
      const res = await createReservation(payload);
      setEvents((prev) => [
        ...prev,
        {
          id: String(res.id),
          title: res.title,
          start: res.start_time,
          end: res.end_time,
          extendedProps: res,
          backgroundColor: '#059669',
        },
      ]);
      alert('예약이 생성되었습니다.');
    } catch (err: any) {
      console.error(err);
      alert(err?.message || '예약 생성에 실패했습니다.');
    }
  };

  const handleEventClick = async (clickInfo: any) => {
    const confirmed = window.confirm('이 예약을 취소하시겠습니까?');
    if (!confirmed) return;
    const id = clickInfo.event.id;
    try {
      await cancelReservation(id);
      clickInfo.event.remove();
      alert('예약이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      alert('취소 실패');
    }
  };

  const handleDownloadICal = async () => {
    try {
      const icalEvents = events.map((e) => ({
        id: String(e.id),
        title: String(e.title),
        description: '',
        startTime: e.start ? new Date(e.start as string).toISOString() : new Date().toISOString(),
        endTime: e.end ? new Date(e.end as string).toISOString() : new Date().toISOString(),
        location: 'SwingNote',
      }));
      
      const icalContent = await icalService.generateICalFile(icalEvents);
      icalService.downloadICalFile(icalContent, 'calendar.ics');
      alert('iCal 파일이 다운로드되었습니다!');
    } catch (err) {
      console.error('Failed to download iCal:', err);
      alert('iCal 파일 생성에 실패했습니다.');
    }
  };

  const handleCopySubscriptionUrl = () => {
    const url = icalService.generateSubscriptionUrl('demo-user', 'demo-token');
    navigator.clipboard.writeText(url);
    alert('구독 URL이 클립보드에 복사되었습니다!');
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">레슨 캘린더</h2>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadICal}
            className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            .ics 다운로드
          </button>
          <button
            onClick={handleCopySubscriptionUrl}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
          >
            <Link2 className="w-4 h-4" />
            구독 URL 복사
          </button>
        </div>
      </div>
      {loading && <div>로딩 중...</div>}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable={true}
        select={handleDateSelect}
        events={events}
        eventClick={handleEventClick}
        height="auto"
      />
    </div>
  );
};

export default CalendarView;