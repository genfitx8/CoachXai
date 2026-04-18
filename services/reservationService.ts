import { LessonReservation, ReservationStatus } from '../types';
import { firebaseService } from './firebase';
import { storageService } from './storage';

class ReservationService {
  private isFirebaseMode(): boolean {
    return firebaseService.isInitialized();
  }

  /**
   * 코치가 예약 가능한 시간대 생성
   */
  async createAvailableSlot(
    coachId: string,
    coachName: string,
    startTime: string,
    endTime: string,
    lessonType?: string
  ): Promise<LessonReservation> {
    const reservation: LessonReservation = {
      id: crypto.randomUUID(),
      coachId,
      coachName,
      startTime,
      endTime,
      status: 'AVAILABLE',
      lessonType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (this.isFirebaseMode()) {
      await firebaseService.saveReservation(reservation);
    } else {
      storageService.saveReservation(reservation);
    }

    return reservation;
  }

  /**
   * 회원이 예약 요청
   */
  async requestReservation(
    reservationId: string,
    clientId: string,
    clientName: string,
    clientPhone: string,
    notes?: string
  ): Promise<LessonReservation> {
    let reservation: LessonReservation | undefined;

    if (this.isFirebaseMode()) {
      const allReservations = await firebaseService.getReservations();
      reservation = allReservations.find((r) => r.id === reservationId);
    } else {
      const allReservations = storageService.getReservations();
      reservation = allReservations.find((r) => r.id === reservationId);
    }

    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }

    if (reservation.status !== 'AVAILABLE') {
      throw new Error('이미 예약된 시간대입니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      clientId,
      clientName,
      clientPhone,
      notes,
      status: 'PENDING',
      updatedAt: Date.now(),
    };

    if (this.isFirebaseMode()) {
      await firebaseService.updateReservation(updatedReservation);
    } else {
      storageService.updateReservation(updatedReservation);
    }

    return updatedReservation;
  }

  /**
   * 코치가 예약 승인
   */
  async approveReservation(reservationId: string): Promise<LessonReservation> {
    let reservation: LessonReservation | undefined;

    if (this.isFirebaseMode()) {
      const allReservations = await firebaseService.getReservations();
      reservation = allReservations.find((r) => r.id === reservationId);
    } else {
      const allReservations = storageService.getReservations();
      reservation = allReservations.find((r) => r.id === reservationId);
    }

    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }

    if (reservation.status !== 'PENDING') {
      throw new Error('대기 중인 예약만 승인할 수 있습니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'CONFIRMED',
      updatedAt: Date.now(),
    };

    if (this.isFirebaseMode()) {
      await firebaseService.updateReservation(updatedReservation);
    } else {
      storageService.updateReservation(updatedReservation);
    }

    return updatedReservation;
  }

  /**
   * 코치가 예약 거부
   */
  async rejectReservation(reservationId: string, reason?: string): Promise<LessonReservation> {
    let reservation: LessonReservation | undefined;

    if (this.isFirebaseMode()) {
      const allReservations = await firebaseService.getReservations();
      reservation = allReservations.find((r) => r.id === reservationId);
    } else {
      const allReservations = storageService.getReservations();
      reservation = allReservations.find((r) => r.id === reservationId);
    }

    if (!reservation) {
      throw new Error('예약을 찾을 수 없습니다.');
    }

    if (reservation.status !== 'PENDING') {
      throw new Error('대기 중인 예약만 거부할 수 있습니다.');
    }

    const updatedReservation: LessonReservation = {
      ...reservation,
      status: 'AVAILABLE',
      clientId: undefined,
      clientName: undefined,
      clientPhone: undefined,
      notes: reason ? `거부됨: ${reason}` : undefined,
      updatedAt: Date.now(),
    };

    if (this.isFirebaseMode()) {
      await firebaseService.updateReservation(updatedReservation);
    } else {
      storageService.updateReservation(updatedReservation);
    }

    return updatedReservation;
  }

  /**
   * 예약 취소
   */
  async cancelReservation(reservationId: string): Promise<void> {
    if (this.isFirebaseMode()) {
      await firebaseService.deleteReservation(reservationId);
    } else {
      storageService.deleteReservation(reservationId);
    }
  }

  /**
   * 코치의 모든 예약 조회 (시작 시간 오름차순 - 다가오는 예약부터)
   */
  async getCoachReservations(
    coachId: string,
    startDate?: string,
    endDate?: string
  ): Promise<LessonReservation[]> {
    let reservations: LessonReservation[];

    if (this.isFirebaseMode()) {
      reservations = await firebaseService.getReservations(coachId);
    } else {
      const allReservations = storageService.getReservations();
      reservations = allReservations.filter((r) => r.coachId === coachId);
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      reservations = reservations.filter((r) => {
        const reservationDate = new Date(r.startTime);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date('2099-12-31');
        return reservationDate >= start && reservationDate <= end;
      });
    }

    return reservations.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * 회원의 모든 예약 조회 (시작 시간 내림차순 - 최근 예약부터)
   */
  async getClientReservations(clientId: string): Promise<LessonReservation[]> {
    let reservations: LessonReservation[];

    if (this.isFirebaseMode()) {
      reservations = await firebaseService.getReservations(undefined, clientId);
    } else {
      const allReservations = storageService.getReservations();
      reservations = allReservations.filter((r) => r.clientId === clientId);
    }

    return reservations.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  /**
   * 특정 코치의 예약 가능한 슬롯 조회 (회원용)
   */
  async getAvailableSlots(
    coachId: string,
    startDate?: string,
    endDate?: string
  ): Promise<LessonReservation[]> {
    let reservations: LessonReservation[];

    if (this.isFirebaseMode()) {
      reservations = await firebaseService.getReservations(coachId);
    } else {
      const allReservations = storageService.getReservations();
      reservations = allReservations.filter((r) => r.coachId === coachId);
    }

    // Filter for available slots only
    reservations = reservations.filter((r) => r.status === 'AVAILABLE');

    // Filter by date range if provided
    if (startDate || endDate) {
      reservations = reservations.filter((r) => {
        const reservationDate = new Date(r.startTime);
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date('2099-12-31');
        return reservationDate >= start && reservationDate <= end;
      });
    }

    return reservations.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }
}

export const reservationService = new ReservationService();
