# TypeScript & React Rules

Applied when editing: `apps/app/src/**/*.tsx`, `apps/app/src/**/*.ts`

## Type Safety

1. **No `any`** — use `unknown` if type is truly unknown, then narrow
2. **No non-null assertions** (`!`) — handle null explicitly
3. **Prefer `interface` over `type`** for object shapes
4. **Import types from `@brighttale/shared`** — don't redefine

## Component Structure

```tsx
// 1. Imports (external → internal → relative)
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProjectCard } from './ProjectCard'

// 2. Types (if component-specific)
interface Props {
  project: Project
  onSave: (id: string) => void
}

// 3. Component (named export, not default)
export function ProjectDetail({ project, onSave }: Props) {
  // hooks first
  // derived state
  // handlers
  // render
}
```

## Code Cleanliness

- No `console.log` — remove before committing
- No commented-out code
- No TODO comments (track in cards)
- No unused imports or variables

## SSR Compatibility

- Use `'use client'` directive only when needed (state, effects, browser APIs)
- Server Components by default
- No `window` / `document` access without guards

## Data Fetching

- Use `fetch` with the API rewrite (requests go through middleware)
- Handle loading, error, and empty states
- Use `{ data, error }` envelope from API responses:
  ```tsx
  const res = await fetch('/api/projects')
  const { data, error } = await res.json()
  if (error) { /* handle */ }
  ```

## Forms

- Use `react-hook-form` + Zod resolver with schemas from `@brighttale/shared`
- Validate on submit, not on every keystroke

## Performance

- Avoid unnecessary re-renders (memoize expensive computations)
- Use `key` prop correctly in lists
- Lazy load heavy components with `dynamic()`
