import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  SkipForward,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { PromptTarget } from '../types';
import {
  generateInterviewQuestion,
  finalizeInterviewToSystemPrompt,
  GeneratedSystemPromptResult,
  InterviewTurn,
} from '../services/geminiService';
import { Button } from './Button';

export interface CoachInterviewCompletion {
  result: GeneratedSystemPromptResult;
  /** The full transcript packaged as a text file to attach to the template. */
  transcriptFile: File;
}

interface CoachInterviewModalProps {
  target: PromptTarget;
  existingSystemPrompt?: string;
  onClose: () => void;
  onComplete: (completion: CoachInterviewCompletion) => void;
}

/**
 * B3 — Interview-mode prompt builder.
 *
 * Drives an AI-guided Q&A: each turn the model reads the transcript and
 * produces one probing question. On "완료" the transcript is packaged as
 * a text file and fed to the existing document→prompt pipeline (B1/B2),
 * so all three input modes converge on the same downstream behaviour.
 */
export const CoachInterviewModal: React.FC<CoachInterviewModalProps> = ({
  target,
  existingSystemPrompt,
  onClose,
  onComplete,
}) => {
  const [transcript, setTranscript] = useState<InterviewTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isFinalising, setIsFinalising] = useState(false);
  const [isReadyToFinalise, setIsReadyToFinalise] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guards the initial-question fetch so React Strict Mode / re-mounts don't
  // fire two AI calls back to back.
  const openerFetchedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchNextQuestion = useCallback(
    async (nextTranscript: InterviewTurn[]) => {
      setIsLoadingQuestion(true);
      setErrorMessage(null);
      try {
        const result = await generateInterviewQuestion({
          target,
          transcript: nextTranscript,
          existingSystemPrompt,
        });
        setCurrentQuestion(result.question);
        setIsReadyToFinalise(result.isFinal);
      } catch (e) {
        console.error('Failed to fetch interview question:', e);
        setErrorMessage(
          e instanceof Error ? e.message : '다음 질문을 불러오지 못했습니다.'
        );
      } finally {
        setIsLoadingQuestion(false);
      }
    },
    [target, existingSystemPrompt]
  );

  // Kick off with the opener question when the modal opens.
  useEffect(() => {
    if (openerFetchedRef.current) return;
    openerFetchedRef.current = true;
    fetchNextQuestion([]);
  }, [fetchNextQuestion]);

  // Autoscroll to latest turn when transcript grows.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length, currentQuestion]);

  const submitAnswer = async (answer: string) => {
    if (!currentQuestion) return;
    const nextTranscript = [
      ...transcript,
      { question: currentQuestion, answer: answer.trim() },
    ];
    setTranscript(nextTranscript);
    setCurrentAnswer('');
    setCurrentQuestion('');
    await fetchNextQuestion(nextTranscript);
  };

  const handleSubmit = () => {
    // Allow empty submission to skip; we still record the turn so the AI
    // knows the coach chose not to answer that particular question.
    submitAnswer(currentAnswer);
  };

  const handleSkip = () => {
    submitAnswer('');
  };

  const handleFinalise = async () => {
    // If the coach ends mid-question (they've already answered N-1 questions
    // and are staring at the Nth), fold whatever they've typed so far into
    // the final turn. Otherwise use the transcript as-is.
    const finalTranscript: InterviewTurn[] =
      currentQuestion && currentAnswer.trim()
        ? [
            ...transcript,
            { question: currentQuestion, answer: currentAnswer.trim() },
          ]
        : transcript;

    if (finalTranscript.length === 0) {
      setErrorMessage('최소 한 개 이상의 질문에 답변한 뒤 마무리해 주세요.');
      return;
    }

    setIsFinalising(true);
    setErrorMessage(null);
    try {
      const {
        transcriptBlob,
        transcriptFileName,
        ...result
      } = await finalizeInterviewToSystemPrompt({
        target,
        transcript: finalTranscript,
        existingSystemPrompt,
      });
      const transcriptFile = new File([transcriptBlob], transcriptFileName, {
        type: 'text/plain',
      });
      onComplete({ result, transcriptFile });
    } catch (e) {
      console.error('Failed to finalise interview:', e);
      setErrorMessage(
        e instanceof Error
          ? e.message
          : '인터뷰를 프롬프트로 변환하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
      setIsFinalising(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-interview-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-indigo-500" />
            <h2 id="coach-interview-title" className="font-bold text-gray-800 text-base">
              인터뷰로 프롬프트 생성{' '}
              <span className="text-gray-400 font-normal">— target: {target}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isFinalising}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transcript + current turn */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isReadyToFinalise && (
            <div className="flex items-start gap-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2.5">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p>
                <span className="font-bold">인터뷰 준비 완료.</span> 지금 마무리해도 좋고, 몇 가지 더 이야기하고 싶다면 계속 답변하세요.
              </p>
            </div>
          )}
          {transcript.length === 0 && !currentQuestion && !isLoadingQuestion && (
            <p className="text-xs text-gray-400 text-center py-8">
              곧 첫 질문이 준비됩니다…
            </p>
          )}
          {transcript.map((turn, i) => (
            <div key={i} className="space-y-2">
              <div className="bg-indigo-50 rounded-lg p-3">
                <p className="text-[11px] font-bold text-indigo-500 mb-1">
                  Q{i + 1}
                </p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {turn.question}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] font-bold text-gray-400 mb-1">
                  A{i + 1}
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {turn.answer.trim() || (
                    <span className="italic text-gray-400">(스킵)</span>
                  )}
                </p>
              </div>
            </div>
          ))}
          {(isLoadingQuestion || currentQuestion) && (
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-[11px] font-bold text-indigo-500 mb-1">
                Q{transcript.length + 1}
              </p>
              {isLoadingQuestion ? (
                <p className="text-sm text-gray-500 italic">
                  다음 질문을 생각하고 있어요…
                </p>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {currentQuestion}
                </p>
              )}
            </div>
          )}
          {errorMessage && (
            <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Answer input */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          <textarea
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder={
              isLoadingQuestion
                ? '질문을 기다리는 중…'
                : '답변을 입력하세요. 짧고 구체적일수록 좋습니다.'
            }
            rows={3}
            disabled={isLoadingQuestion || isFinalising || !currentQuestion}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="text-xs text-gray-400">
              지금까지 답변한 질문: <span className="font-bold text-gray-600">{transcript.length}</span>건
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isLoadingQuestion || isFinalising || !currentQuestion}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward className="w-3.5 h-3.5" /> 스킵
              </button>
              <Button
                onClick={handleSubmit}
                isLoading={isLoadingQuestion}
                disabled={!currentQuestion || isFinalising || !currentAnswer.trim()}
              >
                다음 질문
              </Button>
              <Button
                variant="primary"
                onClick={handleFinalise}
                isLoading={isFinalising}
                disabled={isFinalising || transcript.length === 0}
                icon={<Wand2 className="w-4 h-4" />}
              >
                {isFinalising ? '프롬프트 생성 중…' : '완료 및 프롬프트 생성'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
