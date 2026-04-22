'use client';

import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface RenderFormArgs<TPayload> {
  onSave: (payload: TPayload) => Promise<void>;
  onCancel: () => void;
}

interface Props<TPayload> {
  title: string;
  icon: ReactNode;
  className?: string;
  renderIdle: () => ReactNode;
  renderForm: (args: RenderFormArgs<TPayload>) => ReactNode;
  onSave?: (payload: TPayload) => Promise<void>;
  headerClassName?: string;
}

export function SectionEditPanel<TPayload>({
  title,
  icon,
  className,
  renderIdle,
  renderForm,
  onSave,
  headerClassName,
}: Props<TPayload>) {
  const [editing, setEditing] = useState(false);

  async function handleSave(payload: TPayload) {
    if (!onSave) { setEditing(false); return; }
    try {
      await onSave(payload);
      setEditing(false);
    } catch {
      // onSave-specific callers handle toast; panel stays in edit mode
    }
  }

  return (
    <div className={cn('rounded-lg border bg-card/50 p-4', className)}>
      <div className={cn(
        'flex items-center justify-between gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3',
        headerClassName,
      )}>
        <div className="flex items-center gap-1.5">
          {icon} {title}
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Edit ${title}`}
            onClick={() => setEditing(true)}
            className="h-6 w-6 p-0"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
      {editing
        ? renderForm({ onSave: handleSave, onCancel: () => setEditing(false) })
        : renderIdle()}
    </div>
  );
}
