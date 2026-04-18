import React, { useEffect, useState } from 'react';
import FullCalendar, { EventInput } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import { reservationService } from '../services/reservationService';
import { realtimeSubscribe, realtimeUnsubscribe, realtimeConnect } from '../services/realtime';
import { LessonReservation, CoachProfile, ClientProfile } from '../types';
import { X, Download, Link2 } from 'lucide-react';
import { icalService } from '../services/icalService';

// Extended EventInput type that includes LessonReservation in extendedProps
interface ExtendedEventInput extends EventInput {
  extendedProps?: LessonReservation;
}

// Helper function to generate event title from reservation
const getEventTitle = (reservation: LessonReservation): string => {
  if (reservation.status === 'BLOCKED') {
    return reservation.blockReason || '예약 불가';
  } else if (reservation.clientName) {
    return `${reservation.clientName} - ${reservation.coachName}`;
  } else {
    return `${reservation.coachName} - 예약 가능`;
  }
};

// Helper function to get background color based on reservation status
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'BLOCKED':
      return '#dc2626'; // red
    case 'PENDING':
      return '#f59e0b'; // yellow/orange
    case 'CONFIRMED':
      return '#059669'; // green
    case 'AVAILABLE':
      return '#2563eb'; // blue
    default:
      return '#6b7280'; // gray
  }
};

// Helper function to get status styling for display
const getStatusStyling = (status: string): { typeLabel: string; bgColorClass: string; badgeColorClass: string } => {
  switch (status) {
    case 'BLOCKED':
      return {
        typeLabel: '블럭됨',
        bgColorClass: 'bg-red-100 border-red-300',
        badgeColorClass: 'bg-red-600',
      };
    case 'PENDING':
      return {
        typeLabel: '대기중',
        bgColorClass: 'bg-yellow-100 border-yellow-300',
        badgeColorClass: 'bg-yellow-600',
      };
    case 'CONFIRMED':
      return {
        typeLabel: '승인됨',
        bgColorClass: 'bg-green-100 border-green-300',
        badgeColorClass: 'bg-green-600',
      };
    case 'AVAILABLE':
      return {
        typeLabel: '예약 가능',
        bgColorClass: 'bg-blue-100 border-blue-300',
        badgeColorClass: 'bg-blue-600',
      };
    default:
      return {
        typeLabel: status,
        bgColorClass: 'bg-gray-100 border-gray-300',
        badgeColorClass: 'bg-gray-600',
      };
  }
};

interface CalendarViewProps {
  coachProfile?: CoachProfile;
  clientProfile?: ClientProfile; // For client booking mode
  readOnly?: boolean; // New prop to control read-only mode for clients
  onBookingComplete?: () => void; // Callback when booking is successful
}

const CalendarView: React.FC<CalendarViewProps> = ({ 
  coachProfile, 
  clientProfile, 
  readOnly = false, 
  onBookingComplete 
}) => {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<EventInput[]>([]);
  const [showDateDetail, setShowDateDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Booking modal state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<LessonReservation | null>(null);
  const [bookingNotes, setBookingNotes] = useState('');

  const fetchEvents = async (start?: string, end?: string) => {
    setLoading(true);
    try {
      // Get reservations filtered by coach if coachProfile is provided
      const data = coachProfile 
        ? await reservationService.getCoachReservations(coachProfile.id, start, end)
        : await reservationService.getAllReservations(start, end);
      
      // Convert LessonReservation to EventInput format
      const mapped: EventInput[] = (data || []).map((reservation: LessonReservation) => ({
        id: String(reservation.id),
        title: getEventTitle(reservation),
        start: reservation.startTime,
        end: reservation.endTime,
        extendedProps: reservation,
        backgroundColor: getStatusColor(reservation.status),
      }));
      setEvents(mapped);
    } catch (err) {
      console.error('failed to fetch calendar', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initialize mobile state safely after component mounts
    setIsMobile(window.innerWidth < 768);
    
    fetchEvents();

    const onEvent = (payload: any) => {
      if (!payload || !payload.event) return;
      const reservation = payload.event as LessonReservation;
      
      // Filter out events that don't belong to this coach
      if (coachProfile && reservation.coachId !== coachProfile.id) {
        return;
      }
      
      setEvents((prev) => {
        const filtered = prev.filter((p) => String((p as any).id) !== String(reservation.id));
        if (payload.action === 'delete') return filtered;
        
        const newEv: EventInput = {
          id: String(reservation.id),
          title: getEventTitle(reservation),
          start: reservation.startTime,
          end: reservation.endTime,
          extendedProps: reservation,
          backgroundColor: getStatusColor(reservation.status),
        };
        return [...filtered, newEv];
      });
    };

    // Handle window resize for mobile detection
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);

    realtimeSubscribe('calendar', onEvent);
    realtimeConnect();
    return () => {
      realtimeUnsubscribe('calendar', onEvent);
      window.removeEventListener('resize', handleResize);
    };
  }, [coachProfile]);

  const handleDateSelect = async (selectInfo: any) => {
    alert('캘린더에서 직접 예약을 생성할 수 없습니다. ReservationManager 또는 ClientReservation을 사용하세요.');
    return;
  };

  const handleEventClick = async (clickInfo: any) => {
    const event = clickInfo.event;
    const extendedProps = event.extendedProps as LessonReservation;
    
    // Client booking mode - allow booking AVAILABLE slots
    if (clientProfile && !readOnly && extendedProps?.status === 'AVAILABLE') {
      setSelectedSlot(extendedProps);
      setShowBookingModal(true);
      return;
    }
    
    if (readOnly) {
      // In read-only mode, just show event details without allowing cancellation
      let message = `${event.title}\n`;
      message += `시간: ${new Date(event.start).toLocaleString('ko-KR')} - ${new Date(event.end).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}\n`;
      message += `상태: ${getStatusStyling(extendedProps?.status || 'AVAILABLE').typeLabel}`;
      
      if (extendedProps?.blockReason) {
        message += `\n사유: ${extendedProps.blockReason}`;
      }
      
      alert(message);
      return;
    }
    
    const confirmed = window.confirm('이 예약을 취소하시겠습니까?');
    if (!confirmed) return;
    const id = clickInfo.event.id;
    try {
      await reservationService.cancelReservation(id);
      clickInfo.event.remove();
      alert('예약이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      alert('예약 취소에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleBookingRequest = async () => {
    if (!selectedSlot || !clientProfile) {
      return;
    }

    try {
      const clientId = `${clientProfile.name}_${clientProfile.phone}`;
      await reservationService.requestReservation(
        selectedSlot.id,
        clientId,
        clientProfile.name,
        clientProfile.phone,
        bookingNotes || undefined
      );

      alert('예약 요청이 완료되었습니다. 코치의 승인을 기다려주세요.');
      setShowBookingModal(false);
      setSelectedSlot(null);
      setBookingNotes('');
      
      // Refresh the calendar
      await fetchEvents();
      
      // Notify parent component
      if (onBookingComplete) {
        onBookingComplete();
      }
    } catch (error: any) {
      alert(error.message || '예약 요청에 실패했습니다.');
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
    if (readOnly) {
      alert('읽기 전용 모드에서는 예약을 취소할 수 없습니다.');
      return;
    }
    
    const confirmed = window.confirm('이 예약을 취소하시겠습니까?');
    if (!confirmed) return;
    
    try {
      await reservationService.cancelReservation(eventId);
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

  const handleDownloadICal = async () => {
    try {
      const icalEvents = events.map((e) => ({
        id: String(e.id || ''),
        title: String(e.title || ''),
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
    // TODO: In production, this should receive userId and generate a proper secure token
    // For now, using a demo placeholder
    const url = icalService.generateSubscriptionUrl('calendar-user', btoa('temp-' + Date.now()));
    navigator.clipboard.writeText(url);
    alert('구독 URL이 클립보드에 복사되었습니다!');
  };

  return (
    <div className="relative p-2 sm:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2">
        <h2 className="text-xl sm:text-2xl font-bold">레슨 캘린더</h2>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadICal}
            className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">.ics 다운로드</span>
            <span className="sm:hidden">.ics</span>
          </button>
          <button
            onClick={handleCopySubscriptionUrl}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
          >
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">구독 URL</span>
          </button>
        </div>
      </div>
      {loading && <div className="text-center py-2 text-gray-600">로딩 중...</div>}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={isMobile ? "timeGridDay" : "dayGridMonth"}
        headerToolbar={{
          left: isMobile ? 'prev,next' : 'prev,next today',
          center: 'title',
          right: isMobile ? 'dayGridMonth,timeGridDay' : 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        selectable={true}
        select={handleDateSelect}
        dateClick={handleDateClick}
        events={events}
        eventClick={handleEventClick}
        height="auto"
        locale={koLocale}
        dayMaxEvents={isMobile ? 2 : true}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
          hour12: false
        }}
        slotLabelFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
          hour12: false
        }}
        contentHeight={isMobile ? 'auto' : undefined}
        aspectRatio={isMobile ? 1 : 1.35}
        nowIndicator={true}
        allDaySlot={false}
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
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">일정 상세</h3>
                {selectedDate && (
                  <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                    {formatDate(selectedDate)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowDateDetail(false)}
                className="ml-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                aria-label="닫기"
              >
                <X size={isMobile ? 20 : 24} />
              </button>
            </div>
            
            {/* Content */}
            <div className="px-4 sm:px-6 py-3 sm:py-4">
              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-8 sm:py-12 text-gray-500">
                  <p className="text-base sm:text-lg">일정이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {selectedDateEvents.map((event) => {
                    const extendedEvent = event as ExtendedEventInput;
                    const reservation = extendedEvent.extendedProps;
                    const status = reservation?.status || 'AVAILABLE';
                    const { typeLabel, bgColorClass, badgeColorClass } = getStatusStyling(status);
                    
                    return (
                      <div 
                        key={event.id}
                        className={`border-2 ${bgColorClass} rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${badgeColorClass}`}>
                                {typeLabel}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base truncate">
                              {event.title}
                            </h4>
                            <div className="text-xs sm:text-sm text-gray-600">
                              <p>
                                {formatTime(event.start as string)} - {formatTime(event.end as string)}
                              </p>
                            </div>
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => handleCancelEventFromDetail(event.id as string)}
                              className="ml-2 px-2 sm:px-3 py-1 text-xs sm:text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                            >
                              취소
                            </button>
                          )}
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

      {/* Booking Modal */}
      {showBookingModal && selectedSlot && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowBookingModal(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">레슨 예약</h3>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    코치
                  </label>
                  <div className="text-base text-gray-900">{selectedSlot.coachName}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    일시
                  </label>
                  <div className="text-base text-gray-900">
                    {new Date(selectedSlot.startTime).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} - {new Date(selectedSlot.endTime).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    요청 사항 (선택)
                  </label>
                  <textarea
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    placeholder="레슨에 대한 요청사항이 있으시면 입력해주세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowBookingModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleBookingRequest}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    예약 요청
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarView;