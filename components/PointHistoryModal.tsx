import React, { useEffect, useState } from 'react';
import { PointTransaction, ClientProfile } from '../types';
import { pointService } from '../services/pointService';
import { Calendar, Coins, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';
import { createLogger } from '../utils/logger';
import { Modal } from './ui/Modal';
import { Button } from './Button';

const log = createLogger('pointHistoryModal');

interface PointHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientProfile;
}

export const PointHistoryModal: React.FC<PointHistoryModalProps> = ({
  isOpen,
  onClose,
  client,
}) => {
  const [history, setHistory] = useState<PointTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    pointService
      .getHistory(client)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((e) => log.error('Failed to load point history', e))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, client]);

  const title = (
    <span className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
        <Coins className="h-5 w-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-amber-300/90">
          My Rewards
        </span>
        <span className="text-xl font-semibold leading-tight text-ink-high">
          {(client.currentPoints ?? 0).toLocaleString()} P
        </span>
      </span>
    </span>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      description="적립된 포인트는 레슨비 결제나 쇼핑몰에서 사용하세요."
      size="md"
    >
      <div className="space-y-4">
        <Button
          variant="secondary"
          fullWidth
          size="lg"
          icon={<ShoppingBag className="h-4 w-4" />}
          onClick={() => alert('준비 중인 기능입니다 (쇼핑몰 연동 예정)')}
        >
          포인트몰 바로가기
        </Button>

        <div>
          <h3 className="mb-3 px-1 text-sm font-semibold text-ink-medium">
            최근 내역
          </h3>

          {isLoading ? (
            <div className="py-10 text-center text-ink-muted">불러오는 중...</div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-muted">
              아직 적립된 포인트가 없습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {history.map((item) => {
                const positive = item.amount > 0;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-line-subtle bg-bg-base p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                          positive
                            ? 'bg-primary-500/15 text-primary-300'
                            : 'bg-red-500/15 text-red-300'
                        }`}
                      >
                        {positive ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink-high">{item.description}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                          <Calendar className="h-3 w-3" />
                          {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-base font-semibold tabular-nums ${
                        positive ? 'text-primary-300' : 'text-red-300'
                      }`}
                    >
                      {positive ? '+' : ''}
                      {item.amount.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
