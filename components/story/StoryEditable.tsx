/**
 * 스토리 위에서 글자를 바로 고치는 자리.
 * 기획: docs/LESSON_STORY_UI_PLAN.md §8
 *
 * 코치는 이미 완성된 스토리를 읽고 있다. 제목이 어색하거나 사진에 한마디
 * 달고 싶을 때 별도 편집 화면으로 보내는 대신 **그 자리에서 고치게** 한다.
 *
 * 편집 중에도 글이 흔들리지 않아야 한다 — textarea 가 주변 타이포(글꼴,
 * 크기, 행간, 정렬)를 그대로 물려받고, 높이는 내용에 맞춰 자란다. 그래서
 * 스타일을 통째로 넘겨받는 구조다.
 *
 * 학생에게는 이 컴포넌트가 그냥 글자다(`editable=false`). 편집 자국도,
 * 빈 자리를 채우라는 안내도 보이지 않는다.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface StoryEditableProps {
  value: string;
  /** 저장 — 빈 문자열이면 "지움"을 뜻한다. */
  onSave: (next: string) => void;
  /** 코치 본인이 보고 있는가. false 면 그냥 글자로 그린다. */
  editable: boolean;
  /** 비어 있을 때 코치에게만 보이는 안내. 학생에게는 보이지 않는다. */
  placeholder: string;
  /** 줄바꿈을 허용할지. false 면 Enter 로 저장된다. */
  multiline?: boolean;
  maxLength?: number;
  /** 스크린리더용 이름 — "제목 고치기" 처럼 무엇을 고치는지 말한다. */
  ariaLabel: string;
  className?: string;
  /** 주변 타이포를 그대로 물려받도록 통째로 넘긴다. */
  style?: React.CSSProperties;
}

export const StoryEditable: React.FC<StoryEditableProps> = ({
  value,
  onSave,
  editable,
  placeholder,
  multiline = false,
  maxLength,
  ariaLabel,
  className,
  style,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // 밖에서 값이 바뀌면(AI 생성 도착 등) 편집 중이 아닐 때만 따라간다.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // 내용에 맞춰 높이를 잡는다 — 편집을 시작해도 줄 수가 바뀌지 않게.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editable) {
    return value ? <span className={className} style={style}>{value}</span> : null;
  }

  if (editing) {
    return (
      <textarea
        ref={areaRef}
        value={draft}
        autoFocus
        rows={1}
        maxLength={maxLength}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
            return;
          }
          // 한 줄짜리는 Enter 로 끝낸다. 여러 줄은 ⌘/Ctrl+Enter.
          if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className={className}
        style={{
          ...style,
          width: '100%',
          resize: 'none',
          overflow: 'hidden',
          background: 'rgba(43,53,71,0.05)',
          border: '1px solid rgba(43,53,71,0.22)',
          borderRadius: '4px',
          padding: '0.15rem 0.35rem',
          margin: '-0.15rem -0.35rem',
          outline: 'none',
          display: 'block',
        }}
      />
    );
  }

  const empty = !value.trim();
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className={className}
      style={{
        ...style,
        width: '100%',
        background: 'none',
        border: 0,
        padding: '0.15rem 0.35rem',
        margin: '-0.15rem -0.35rem',
        cursor: 'text',
        // 편집 가능한 자리라는 것만 아주 옅게 알린다 — 종이 위에 상자를
        // 그리면 읽는 화면이 아니라 폼처럼 보인다.
        borderRadius: '4px',
        boxShadow: 'inset 0 -1px 0 rgba(43,53,71,0.12)',
        // 버튼이지만 문단처럼 읽혀야 한다.
        font: 'inherit',
        textAlign: (style?.textAlign as React.CSSProperties['textAlign']) ?? 'inherit',
        color: empty ? 'var(--paper-pencil)' : style?.color,
        opacity: empty ? 0.75 : 1,
        display: 'block',
      }}
    >
      {empty ? placeholder : value}
    </button>
  );
};
