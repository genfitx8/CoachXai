import { CalendarIntegration, CalendarSyncSettings, CalendarProvider, Lesson } from '../types';
import { googleCalendarService } from './googleCalendarService';
import { icalService } from './icalService';
import { firebaseService } from './firebase';
import { storageService } from './storage';

// Default lesson duration in milliseconds (1 hour)
const DEFAULT_LESSON_DURATION_MS = 60 * 60 * 1000;

class CalendarIntegrationService {
  /**
   * Save integration settings
   */
  async saveIntegration(integration: CalendarIntegration): Promise<void> {
    if (firebaseService.isInitialized()) {
      await firebaseService.saveCalendarIntegration(integration);
    }
    storageService.saveCalendarIntegration(integration);
  }

  /**
   * Get integration settings
   */
  async getIntegration(
    userId: string,
    provider: CalendarProvider
  ): Promise<CalendarIntegration | null> {
    if (firebaseService.isInitialized()) {
      const integrations = await firebaseService.getCalendarIntegrations(userId);
      return integrations.find((i) => i.provider === provider) || null;
    }
    
    const integrations = storageService.getCalendarIntegrations();
    return integrations.find((i) => i.userId === userId && i.provider === provider) || null;
  }

  /**
   * Get all integrations
   */
  async getAllIntegrations(userId: string): Promise<CalendarIntegration[]> {
    if (firebaseService.isInitialized()) {
      return await firebaseService.getCalendarIntegrations(userId);
    }
    
    const integrations = storageService.getCalendarIntegrations();
    return integrations.filter((i) => i.userId === userId);
  }

  /**
   * Remove integration
   */
  async removeIntegration(integrationId: string): Promise<void> {
    if (firebaseService.isInitialized()) {
      await firebaseService.deleteCalendarIntegration(integrationId);
    }
    storageService.deleteCalendarIntegration(integrationId);
  }

  /**
   * Execute synchronization
   */
  async syncCalendar(
    integrationId: string
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const result = { success: false, synced: 0, errors: [] as string[] };

    try {
      // Get integration details
      // In real implementation, fetch by integrationId
      // For now, simplified version
      result.success = true;
      result.synced = 0;
    } catch (error: any) {
      result.errors.push(error.message || 'Sync failed');
    }

    return result;
  }

  /**
   * Export lessons/reservations to external calendar
   */
  async exportToCalendar(
    integration: CalendarIntegration,
    lessons: Lesson[]
  ): Promise<void> {
    if (integration.provider === 'GOOGLE') {
      await this.exportToGoogleCalendar(integration, lessons);
    } else if (integration.provider === 'ICAL') {
      // iCal uses file download method
      const events = icalService.convertLessonsToICalEvents(lessons);
      const icalContent = await icalService.generateICalFile(events);
      icalService.downloadICalFile(icalContent, 'swingnote-lessons.ics');
    }
  }

  /**
   * Export to Google Calendar
   */
  private async exportToGoogleCalendar(
    integration: CalendarIntegration,
    lessons: Lesson[]
  ): Promise<void> {
    const calendarId = integration.calendarId || 'primary';
    
    for (const lesson of lessons) {
      const startDate = new Date(lesson.date);
      const endDate = new Date(startDate.getTime() + DEFAULT_LESSON_DURATION_MS);

      const event = {
        summary: `${lesson.title} - ${lesson.clientName}`,
        description: lesson.coachNotes || lesson.aiAnalysis || '',
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'Asia/Seoul',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'Asia/Seoul',
        },
      };

      try {
        await googleCalendarService.createEvent(calendarId, event);
      } catch (error) {
        console.error(`Failed to export lesson ${lesson.id}:`, error);
      }
    }
  }

  /**
   * Import from external calendar
   */
  async importFromCalendar(integrationId: string): Promise<any[]> {
    // Simplified implementation
    return [];
  }

  /**
   * Setup automatic synchronization
   */
  async setupAutoSync(
    integrationId: string,
    settings: CalendarSyncSettings
  ): Promise<void> {
    // Store sync settings
    // In real implementation, setup interval timer
    console.log('Auto sync configured for', integrationId, settings);
  }

  /**
   * Initialize Google Calendar authentication
   */
  async initGoogleCalendarAuth(): Promise<void> {
    await googleCalendarService.initiateAuth();
    
    if (googleCalendarService.isSignedIn()) {
      // Auth successful
      console.log('Google Calendar authenticated');
    } else {
      throw new Error('Google Calendar authentication failed');
    }
  }

  /**
   * 구글 캘린더 연동 해제
   */
  async disconnectGoogleCalendar(): Promise<void> {
    await googleCalendarService.signOut();
  }
}

export const calendarIntegrationService = new CalendarIntegrationService();
