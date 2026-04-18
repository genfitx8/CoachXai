import React, { useEffect, useState } from 'react';
import FullCalendar, { EventInput } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import { fetchCalendar, createReservation, cancelReservation } from '../services/reservationApi';
import { realtimeSubscribe, realtimeUnsubscribe, realtimeConnect } from '../services/realtime';
import { CalendarEvent, ReservationPayload } from '../types/calendar';
import { X } from 'lucide-react';

// Extended EventInput type that includes CalendarEvent in extendedProps
interface ExtendedEventInput extends EventInput {
  extendedProps?: CalendarEvent;
}

const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<EventInput[]>([]);
  const [showDateDetail, setShowDateDetail] = useState(false);

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
      alert('예약 취소에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // Helper function to get date string from date/time string
  const getDateString = (dateTimeStr: string): string => {
    const date = new Date(dateTimeStr);
    // Use local date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateClick = (dateInfo: DateClickArg) => {
    const clickedDate = dateInfo.dateStr;
    setSelectedDate(clickedDate);
    
    // Filter events for the clicked date
    const dateEvents = events.filter(event => {
      const eventDate = getDateString(event.start as string);
      return eventDate === clickedDate;
    });
    
    // Sort events by start time
    setSelectedDateEvents(dateEvents.sort((a, b) => {
      return new Date(a.start as string).getTime() - new Date(b.start as string).getTime();
    }));
    
    setShowDateDetail(true);
  };

  const handleCancelEventFromDetail = async (eventId: string) => {
    const confirmed = window.confirm('이 예약을 취소하시겠습니까?');
    if (!confirmed) return;
    
    try {
      await cancelReservation(eventId);
      // Remove from events state
      setEvents(prev => prev.filter(e => e.id !== eventId));
      // Remove from selected date events
      setSelectedDateEvents(prev => prev.filter(e => e.id !== eventId));
      alert('예약이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      alert('예약 취소에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
  };

  return (
    <div className="relative p-4">
      <h2 className="text-2xl font-bold mb-4">레슨 캘린더</h2>
      {loading && <div className="text-center py-2 text-gray-600">로딩 중...</div>}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        selectable={true}
        select={handleDateSelect}
        dateClick={handleDateClick}
        events={events}
        eventClick={handleEventClick}
        height="auto"
        locale={koLocale}
      />
      
      {/* Side Panel for Date Details */}
      {showDateDetail && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowDateDetail(false)}
          />
          
          {/* Side Panel */}
          <div className="fixed right-0 top-0 h-full w-full md:w-96 bg-white shadow-xl z-50 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">일정 상세</h3>
                {selectedDate && (
                  <p className="text-sm text-gray-600 mt-1">
                    {formatDate(selectedDate)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowDateDetail(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Content */}
            <div className="px-6 py-4">
              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg">일정이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateEvents.map((event) => {
                    const extendedEvent = event as ExtendedEventInput;
                    const extendedProps = extendedEvent.extendedProps;
                    const eventType = extendedProps?.type || 'reservation';
                    const typeLabel = eventType === 'lesson' ? '레슨' : '예약';
                    const bgColorClass = eventType === 'lesson' ? 'bg-blue-100 border-blue-300' : 'bg-green-100 border-green-300';
                    const badgeColorClass = eventType === 'lesson' ? 'bg-blue-600' : 'bg-green-600';
                    
                    return (
                      <div 
                        key={event.id}
                        className={`border-2 ${bgColorClass} rounded-lg p-4 hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${badgeColorClass}`}>
                                {typeLabel}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900 mb-1">
                              {event.title}
                            </h4>
                            <div className="text-sm text-gray-600">
                              <p>
                                {formatTime(event.start as string)} - {formatTime(event.end as string)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelEventFromDetail(event.id as string)}
                            className="ml-2 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarView;