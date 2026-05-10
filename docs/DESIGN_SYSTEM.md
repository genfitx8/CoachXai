# CoachX AI Design System

A short reference for the CoachX AI visual language. The goal is a quiet,
premium feel: deep emerald brand on warm-tinted dark surfaces, generous
spacing, calm motion, and a single shared set of primitives so screens stay
consistent without re-inventing chrome each time.

---

## 1. Tokens

All tokens live in two places that are kept in sync by hand:

- `tailwind.config.js` — class names (`bg-bg-base`, `text-ink-high`, …)
- `index.css` `:root` — runtime CSS variables (`var(--bg-base)`)

Prefer the **semantic** names below over raw palette shades. If you find
yourself reaching for `surface-700` or `slate-800`, ask whether the role
("page background", "raised card", "muted label") already has a token.

### Background layers

| Token             | Hex       | Use                                |
| ----------------- | --------- | ---------------------------------- |
| `bg-base`         | `#080c0a` | Page background                    |
| `bg-raised`       | `#10160d` | Cards, sections one level above    |
| `bg-overlay`      | `#1c221d` | Modals, popovers, dropdowns        |
| `bg-inset`        | `#040605` | Pressed wells, inset code blocks   |

### Foreground (ink)

| Token         | Hex       | Use                          |
| ------------- | --------- | ---------------------------- |
| `ink-high`    | `#f3f5f4` | Primary body & headings      |
| `ink-medium`  | `#b9bfbc` | Secondary labels             |
| `ink-muted`   | `#8a918e` | Captions, meta, helper text  |
| `ink-faint`   | `#5e6562` | Disabled, placeholder        |

### Hairlines

| Token            | Use                                        |
| ---------------- | ------------------------------------------ |
| `line-subtle`    | Inner dividers, internal card separators   |
| `line-default`   | Card borders, input borders                |
| `line-strong`    | Hover/focus borders                        |

### Brand

`primary-500` (`#10b981`) is the brand emerald. Use the `primary-*` ramp for
brand surfaces (CTA buttons, focus rings, brand chips). `accent-*` is a
muted violet reserved for occasional highlights — do **not** mix it with
`primary` in the same affordance.

### Elevation

Use `shadow-elev-1` … `shadow-elev-4` as a numbered ladder. `glow` and
`glow-lg` are reserved for brand-emphasis surfaces (e.g. AI activity hero).

---

## 2. Typography

`Noto Sans KR` for everything (already loaded). The new display sizes are
designed for hero moments only:

| Class            | Size / line-height       | Use                       |
| ---------------- | ------------------------ | ------------------------- |
| `text-display-lg`| 48 / 52 px, tight        | Landing hero              |
| `text-display`   | 36 / 40 px               | Section heroes            |
| `text-display-sm`| 30 / 36 px               | Card hero / modal title   |
| `text-2xl`–`text-base`| Tailwind defaults   | Body & UI copy            |
| `text-2xs`       | 10 / 14 px               | Badges, micro-meta        |

Headings should use `tracking-tight` and `text-ink-high`. Body copy defaults
to `text-ink-high`; use `text-ink-medium` to demote.

---

## 3. Primitives

All primitives live under `components/ui/` and are re-exported from
`components/ui/index.ts`. Import via:

```tsx
import { Card, CardTitle, Input, Modal, Badge } from './ui';
```

### Button (`components/Button.tsx`)

```tsx
<Button>저장</Button>                              // primary, md
<Button variant="secondary" size="sm">취소</Button>
<Button variant="danger" isLoading>삭제 중…</Button>
<Button variant="ghost" icon={<X />}>닫기</Button>
<Button fullWidth>다음</Button>
```

Sizes: `sm` 36 px / `md` 44 px / `lg` 52 px (mobile-friendly tap targets).
Variants always honour the focus ring; disable states drop opacity but
preserve layout.

### Card

```tsx
<Card>
  <CardTitle>이번 주 요약</CardTitle>
  <CardDescription>지난 7일 동안의 학생 활동</CardDescription>
  …
</Card>

<Card variant="elevated" interactive onClick={openLesson}>…</Card>
<Card variant="glass">…</Card>           // for hero overlays
<Card variant="outline" padding="none">…</Card>
```

### Input / Textarea

```tsx
<Input
  label="학생 이름"
  placeholder="이지영"
  helper="학생 목록에 표시됩니다"
  leading={<Search />}
/>

<Input label="이메일" type="email" error="올바른 형식이 아닙니다" />

<Textarea label="레슨 메모" rows={6} />
```

Always pass `label`. If the design hides it visually use `srOnlyLabel` —
never drop it; assistive tech relies on it.

### Modal

```tsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="레슨 패키지 추가"
  description="학생에게 부여할 패키지를 선택하세요"
  footer={
    <>
      <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
      <Button onClick={save}>저장</Button>
    </>
  }
>
  …
</Modal>
```

The modal traps focus, restores focus on close, locks body scroll, and
shows as a bottom-sheet on small viewports (`sm:rounded-2xl` switches to a
centred dialog at ≥640 px).

### Badge

```tsx
<Badge tone="primary" dot>예약 확정</Badge>
<Badge tone="warning">결제 대기</Badge>
```

Tones map to status: `success` for completed, `warning` for pending,
`danger` for cancelled/failed, `info` for neutral system messages,
`primary` for brand-positive, `neutral` for everything else.

---

## 4. Motion

Stay calm. Existing `slide-in-*`, `scale-in`, `pulse-soft` keyframes are
fine; reach for them sparingly and never on every card. Hover lift on
interactive cards is `-translate-y-0.5` only — anything more reads as a
toy.

For one-shot transitions prefer the cubic-bezier `(0.16, 1, 0.3, 1)`
already wired into the keyframes (a soft "out-expo").

---

## 5. Mobile rules of thumb

- Tap targets ≥ 44 × 44 px → `Button` defaults to 44 px (`size="md"`).
- Use `safe-top` / `safe-bottom` (already in `index.css`) for full-bleed
  layouts so content clears the iOS notch / home indicator.
- Modals start as bottom sheets under 640 px. Don't over-ride this.
- Avoid `hover:` as the only feedback channel — pair with `active:` or a
  visible pressed state.

---

## 6. Migration notes

The old `Button.tsx` used hard-coded indigo→violet gradients that did not
match the brand emerald defined in `tailwind.config.js`. The new `Button`
uses the `primary-*` ramp directly. Most call-sites pick up the new look
automatically; if you previously wrote custom indigo classes around a
button, drop them and let the variant do the work.
