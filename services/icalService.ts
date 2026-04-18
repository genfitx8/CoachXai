import { createEvents, EventAttributes } from 'ics';
import { Lesson } from '../types';

interface ICalEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
}

// Default lesson duration in milliseconds (1 hour)
const DEFAULT_LESSON_DURATION_MS = 60 * 60 * 1000;

class ICalService {
  /**
   * Convert lesson/reservation data to .ics format
   */
  async generateICalFile(events: ICalEvent[]): Promise<string> {
    const icsEvents: EventAttributes[] = events.map((event) => {
      const startDate = new Date(event.startTime);
      const endDate = new Date(event.endTime);

      return {
        start: [
          startDate.getFullYear(),
          startDate.getMonth() + 1,
          startDate.getDate(),
          startDate.getHours(),
          startDate.getMinutes(),
        ] as [number, number, number, number, number],
        end: [
          endDate.getFullYear(),
          endDate.getMonth() + 1,
          endDate.getDate(),
          endDate.getHours(),
          endDate.getMinutes(),
        ] as [number, number, number, number, number],
        title: event.title,
        description: event.description || '',
        location: event.location || '',
        uid: event.id,
        productId: 'swingnote/calendar',
      };
    });

    return new Promise((resolve, reject) => {
      createEvents(icsEvents, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * Generate .ics for a single event
   */
  async generateSingleEventICal(event: ICalEvent): Promise<string> {
    return this.generateICalFile([event]);
  }

  /**
   * Convert lesson data to .ics events
   */
  convertLessonsToICalEvents(lessons: Lesson[]): ICalEvent[] {
    return lessons.map((lesson) => ({
      id: lesson.id,
      title: `${lesson.title} - ${lesson.clientName}`,
      description: lesson.coachNotes || lesson.aiAnalysis || '',
      startTime: new Date(lesson.date).toISOString(),
      endTime: new Date(new Date(lesson.date).getTime() + DEFAULT_LESSON_DURATION_MS).toISOString(),
      location: 'SwingNote 레슨',
    }));
  }

  /**
   * Generate iCal subscription URL (webcal link)
   */
  generateSubscriptionUrl(userId: string, token: string): string {
    const baseUrl = import.meta.env.VITE_CALENDAR_BASE_URL || window.location.origin;
    return `${baseUrl}/api/calendar/subscribe/${userId}?token=${token}`;
  }

  /**
   * Download .ics file
   */
  downloadICalFile(content: string, filename: string = 'calendar.ics'): void {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const icalService = new ICalService();
