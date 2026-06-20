import React, { useState } from 'react';
import { CheckCircle, XCircle, ChevronRight, RotateCcw, Trophy } from 'lucide-react';
import type { ChapterQuiz, QuizQuestion, QuizAnswer } from '../types/textbook';

interface QuizPlayerProps {
  quiz: ChapterQuiz;
  chapterId: string;
  textbookId: string;
  onSubmit: (answers: QuizAnswer[], score: number, passed: boolean) => Promise<void>;
  onClose: () => void;
  previousBestScore?: number;
  previousAttempts?: number;
}

type Phase = 'intro' | 'quiz' | 'result';

export const QuizPlayer: React.FC<QuizPlayerProps> = ({
  quiz,
  onSubmit,
  onClose,
  previousBestScore = 0,
  previousAttempts = 0,
}) => {
  const [phase, setPhase] = useState<Phase>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; answers: QuizAnswer[] } | null>(null);

  const currentQuestion: QuizQuestion | undefined = quiz.questions[currentIndex];
  const totalPoints = quiz.questions.reduce((s, q) => s + q.points, 0);

  function handleSelectAnswer(value: string) {
    setSelectedAnswer(value);
  }

  function handleNextQuestion() {
    if (selectedAnswer === null || !currentQuestion) return;

    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    const pointsEarned = isCorrect ? currentQuestion.points : 0;

    const newAnswers = [...answers, {
      questionId: currentQuestion.id,
      answer: selectedAnswer,
      isCorrect,
      pointsEarned,
    }];
    setAnswers(newAnswers);
    setSelectedAnswer(null);

    if (currentIndex + 1 < quiz.questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      finishQuiz(newAnswers);
    }
  }

  async function finishQuiz(finalAnswers: QuizAnswer[]) {
    const earnedPoints = finalAnswers.reduce((s, a) => s + a.pointsEarned, 0);
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;

    setResult({ score, passed, answers: finalAnswers });
    setPhase('result');

    setSubmitting(true);
    try {
      await onSubmit(finalAnswers, score, passed);
    } catch (e) {
      console.error('[QuizPlayer] submit error:', e);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setPhase('intro');
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setAnswers([]);
    setResult(null);
  }

  // ── Intro ────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-500/20 mb-2">
            <Trophy className="w-7 h-7 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-100">챕터 시험</h3>
          <p className="text-sm text-slate-400">
            {quiz.questions.length}문항 · 통과 기준 {quiz.passingScore}점
          </p>
          {previousAttempts > 0 && (
            <div className="inline-block bg-slate-800 rounded-xl px-4 py-2 text-sm">
              <span className="text-slate-400">최고 점수: </span>
              <span className="font-bold text-indigo-300">{previousBestScore}점</span>
              <span className="text-slate-500 ml-2">({previousAttempts}회 응시)</span>
            </div>
          )}
        </div>

        <ul className="space-y-2">
          {quiz.questions.map((q, i) => (
            <li key={q.id} className="flex items-center gap-3 text-sm text-slate-300 bg-slate-800/50 rounded-xl px-4 py-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="truncate">{q.question}</span>
              <span className="ml-auto text-xs text-slate-500 shrink-0">{q.points}점</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            취소
          </button>
          <button
            onClick={() => setPhase('quiz')}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
          >
            시험 시작
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz ────────────────────────────────────────────────────────────────
  if (phase === 'quiz' && currentQuestion) {
    const progress = ((currentIndex) / quiz.questions.length) * 100;

    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-5">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{currentIndex + 1} / {quiz.questions.length} 문항</span>
            <span>{currentQuestion.points}점</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="bg-slate-800/60 rounded-xl p-4">
          <p className="text-base font-semibold text-slate-100 leading-relaxed">
            {currentQuestion.question}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {(currentQuestion.type === 'true_false'
            ? (currentQuestion.options ?? ['맞다', '틀리다'])
            : (currentQuestion.options ?? [])
          ).map((option, idx) => {
            const value = String(idx);
            const isSelected = selectedAnswer === value;
            return (
              <button
                key={idx}
                onClick={() => handleSelectAnswer(value)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                    : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <span className={`inline-block w-6 h-6 rounded-full border text-xs font-bold mr-3 text-center leading-5 ${
                  isSelected ? 'border-indigo-400 bg-indigo-600/40 text-indigo-200' : 'border-slate-600 text-slate-500'
                }`}>
                  {String.fromCharCode(65 + idx)}
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {/* Next button */}
        <button
          onClick={handleNextQuestion}
          disabled={selectedAnswer === null}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          {currentIndex + 1 < quiz.questions.length ? (
            <>다음 문항 <ChevronRight className="w-4 h-4" /></>
          ) : (
            '시험 완료'
          )}
        </button>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const { score, passed, answers: finalAnswers } = result;

    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-5">
        {/* Score banner */}
        <div className={`rounded-2xl p-6 text-center ${passed ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          {passed ? (
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          ) : (
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          )}
          <div className={`text-4xl font-black mb-1 ${passed ? 'text-emerald-300' : 'text-red-300'}`}>
            {score}점
          </div>
          <div className={`text-sm font-semibold ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {passed ? '✓ 챕터 통과!' : `통과 기준 ${quiz.passingScore}점 미달`}
          </div>
          {submitting && <div className="text-xs text-slate-500 mt-2">결과 저장 중...</div>}
        </div>

        {/* Per-question review */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-400">문항별 결과</h4>
          {quiz.questions.map((q, i) => {
            const ans = finalAnswers.find((a) => a.questionId === q.id);
            const isCorrect = ans?.isCorrect ?? false;
            const selectedOption = ans ? (q.options?.[parseInt(ans.answer)] ?? ans.answer) : '-';
            const correctOption = q.options?.[parseInt(q.correctAnswer)] ?? q.correctAnswer;

            return (
              <div
                key={q.id}
                className={`rounded-xl p-3.5 border text-sm space-y-1.5 ${isCorrect ? 'border-emerald-700/40 bg-emerald-900/10' : 'border-red-700/40 bg-red-900/10'}`}
              >
                <div className="flex items-start gap-2">
                  {isCorrect
                    ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  }
                  <p className="text-slate-200 font-medium leading-snug">{i + 1}. {q.question}</p>
                </div>
                {!isCorrect && (
                  <div className="pl-6 space-y-0.5">
                    <p className="text-xs text-red-400">내 답: {selectedOption}</p>
                    <p className="text-xs text-emerald-400">정답: {correctOption}</p>
                  </div>
                )}
                <p className="pl-6 text-xs text-slate-400 italic">{q.explanation}</p>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {!passed && (
            <button
              onClick={handleRetry}
              className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              다시 도전
            </button>
          )}
          <button
            onClick={onClose}
            className={`py-3 rounded-xl font-bold text-sm transition-colors ${
              passed ? 'flex-1 bg-emerald-600 hover:bg-emerald-500 text-white' : 'flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {passed ? '다음 챕터로' : '닫기'}
          </button>
        </div>
      </div>
    );
  }

  return null;
};
