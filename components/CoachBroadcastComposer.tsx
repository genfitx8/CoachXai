import React, { useMemo, useState } from 'react';
import { Button } from './Button';
import { ClientProfile } from '../types';
import {
  BroadcastResult,
  broadcastToStudents,
} from '../services/notificationPreferenceService';

interface Props {
  coachId: string;
  clients: ClientProfile[];
  onClose?: () => void;
}

const TITLE_LIMIT = 100;
const BODY_LIMIT = 500;

export const CoachBroadcastComposer: React.FC<Props> = ({ coachId, clients, onClose }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const myStudents = useMemo(
    () => clients.filter((c) => c.coachId === coachId),
    [clients, coachId]
  );

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    title.length <= TITLE_LIMIT &&
    body.length <= BODY_LIMIT &&
    myStudents.length > 0 &&
    !sending;

  const send = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await broadcastToStudents(title.trim(), body.trim());
      setResult(res);
      setTitle('');
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink-high">학생 전체 공지</h2>
        <p className="text-sm text-ink-medium mt-1">
          지금 담당 학생 <b className="text-primary-400">{myStudents.length}명</b>에게
          동시에 푸시 알림을 보냅니다.
        </p>
      </div>

      <div>
        <label className="block text-xs text-ink-medium mb-1">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_LIMIT}
          placeholder="예) 이번 주 레슨 일정 안내"
          className="w-full rounded-lg bg-bg-overlay border border-line-default px-3 py-2 text-sm text-ink-high focus:outline-none focus:border-primary-500"
        />
        <div className="text-[10px] text-ink-medium text-right mt-1">
          {title.length} / {TITLE_LIMIT}
        </div>
      </div>

      <div>
        <label className="block text-xs text-ink-medium mb-1">본문</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_LIMIT}
          rows={5}
          placeholder="공지 내용을 입력하세요"
          className="w-full rounded-lg bg-bg-overlay border border-line-default px-3 py-2 text-sm text-ink-high focus:outline-none focus:border-primary-500 resize-none"
        />
        <div className="text-[10px] text-ink-medium text-right mt-1">
          {body.length} / {BODY_LIMIT}
        </div>
      </div>

      {myStudents.length === 0 && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs text-yellow-300">
          담당 학생이 없어 공지를 보낼 수 없습니다.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
          발송 실패: {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-primary-500/10 border border-primary-500/30 p-3 text-xs text-primary-300 space-y-1">
          <div>
            총 <b>{result.totalStudents}</b>명 중{' '}
            <b>{result.eligibleStudents}</b>명이 알림 대상
          </div>
          <div>
            전송 성공 <b>{result.delivered}</b>건 · 실패 <b>{result.failed}</b>건
          </div>
          {result.totalStudents - result.eligibleStudents > 0 && (
            <div className="text-ink-medium">
              (알림을 꺼둔 학생 {result.totalStudents - result.eligibleStudents}명은 제외)
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {onClose && (
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            닫기
          </Button>
        )}
        <Button
          variant="primary"
          fullWidth
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
        >
          {myStudents.length}명에게 보내기
        </Button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-bg-base border border-line-default p-5 space-y-3">
            <h3 className="text-base font-semibold text-ink-high">공지 발송 확인</h3>
            <p className="text-sm text-ink-medium">
              <b>{myStudents.length}명</b>에게 방금 작성한 내용을 발송할까요? 이
              작업은 되돌릴 수 없습니다.
            </p>
            <div className="rounded-lg bg-bg-overlay border border-line-default p-3">
              <div className="text-sm font-medium text-ink-high">{title}</div>
              <div className="text-xs text-ink-medium mt-1 whitespace-pre-wrap">
                {body}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
              >
                취소
              </Button>
              <Button
                variant="primary"
                fullWidth
                isLoading={sending}
                onClick={send}
              >
                발송
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
