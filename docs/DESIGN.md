# ClearPaisa design system

Calm and plain, for people new to managing money. One accent colour, lots of
paper, numbers that are easy to read. Build new screens from these pieces
before inventing new ones.

## Principles

- **One headline number per page** (left to spend, total balance). Everything
  else supports it.
- **Status is never colour alone**: an icon and words (`BudgetStatus`, alerts).
- **Money in lists uses `.tabular`** (monospaced, so amounts line up like a
  passbook). Standalone figures use the regular font.
- **No decoration that doesn't carry meaning**: no gradients, no motion for
  its own sake. Transitions are short, and a device set to reduce motion gets
  none (a global rule in `globals.css`).

## Tokens (`src/app/globals.css`)

| Token                                    | Use                                                       |
| ---------------------------------------- | --------------------------------------------------------- |
| `--background` paper, `--foreground` ink | Page and body text                                        |
| `--card`                                 | Surfaces (cards, lists, dialogs)                          |
| `--primary` teal                         | The one accent: main buttons, links, focus ring, progress |
| `--muted-foreground`                     | Secondary text, labels, hints                             |
| `--destructive`                          | Errors, over budget, delete                               |
| `--warning`                              | Almost used up, card amounts owed                         |
| `--chart-1` / `--chart-2`                | Income / spending (validated for colour blindness)        |

**Category colors** (D-028) are generated, not picked from a fixed list: muted,
never gray, 3:1 on both backgrounds, and different enough from the others of
the same kind to tell apart side by side (`src/lib/category-colors.ts`). They
always come with the category's icon and name.

**Radius by role:** `rounded-2xl` cards and page sections, `rounded-xl` tiles
inside a card, `rounded-lg` controls (buttons, inputs), `rounded-full` pills,
avatars and icon badges.

**Type:** `font-heading` (Young Serif) for page titles (`text-3xl`, via
`PageHeader`), section titles (`text-xl`) and card titles (`text-lg`);
Onest for everything else; `font-medium` for list-group labels.

**Surfaces:** `rounded-2xl bg-card ring-1 ring-foreground/10`, padding `p-5`
(`sm:p-6` for a page's main card). Inset tiles inside a card:
`rounded-xl bg-muted/50`.

## Layout

- Content is centred, `max-w-5xl`. Sections are spaced `gap-6`–`gap-8`.
- **Navigation:** sidebar from `lg` (1024px). Below that (phones, tablets in
  portrait) a top bar and a bottom bar with the add button; content gets the
  full width.
- **Where actions go:** at the top right of the thing they act on: the page
  header (`PageHeader actions`) for the page, the tab row when the action
  depends on the active tab, a list's header for "add to this list". Never
  inside a summary card.

## Components

| Need                               | Use                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Page title, description, actions   | `PageHeader`                                                                                                                     |
| Nothing here yet                   | `EmptyState` (title, one sentence, optional action)                                                                              |
| Not found / failed to load         | `StatusView`, `NotFoundView`, `ErrorView` (`error.tsx` / `not-found.tsx`)                                                        |
| A form field                       | `FormField` + `fieldAria(id, error, hasHint)`                                                                                    |
| "Are you sure?"                    | `ConfirmDialog`                                                                                                                  |
| A few mutually exclusive options   | `Segmented`                                                                                                                      |
| Progress against a limit or target | `Meter` + `BudgetStatus`                                                                                                         |
| Buttons                            | `Button`: `default` for the one main action in view, `outline` for secondary, `ghost` for quiet ones, `destructive` for deleting |

**Text links** (utilities in `globals.css`), all with the same focus ring as
buttons:

- `link`: standalone ("All budgets", "Plan & billing"); underlined on hover.
- `link-inline`: inside a sentence; always underlined, so it isn't told apart
  by colour alone (WCAG 1.4.1).
- `link-quiet`: secondary actions in muted text ("Skip for now").

## States

| State         | How                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------ |
| Loading       | The page streams behind a `Suspense` skeleton shaped like the content                      |
| Empty         | `EmptyState`, saying what will appear and how                                              |
| Error         | `ErrorView` with **Try again** (`retry()`) and a reference code                            |
| Saving        | The submit button disables and says what's happening ("Saving…")                           |
| Done          | A short toast in the past tense ("Entry saved", "Goal added")                              |
| Invalid input | The message under the field, in words people use ("Enter an amount like 250 or 1,250.50.") |

## Accessibility checklist

- Every control has a visible label (or `aria-label` for icon buttons).
- Errors are announced (`role="alert"`) and linked with `aria-describedby`;
  hints are linked too.
- Keyboard: every interactive element shows the focus ring; dialogs trap focus
  and close on Escape (Base UI).
- Landmarks: one `<main>`, labelled `<nav>`s, and a "Skip to content" link as
  the first stop for the keyboard (in the app shell).
- Motion: `prefers-reduced-motion: reduce` turns animations and transitions off.
