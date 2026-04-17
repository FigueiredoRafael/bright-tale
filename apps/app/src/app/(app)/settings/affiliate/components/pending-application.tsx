import type { Affiliate } from '@tn-figueiredo/affiliate';
import { strings } from './strings';

interface Props { me: Affiliate }

export function PendingApplication({ me }: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.pending.title}</h1>
      <p>{strings.state.pending.body}</p>
      <dl className="text-sm text-muted-foreground">
        <dt>Código sugerido</dt><dd>{me.code ?? '—'}</dd>
      </dl>
    </div>
  );
}
