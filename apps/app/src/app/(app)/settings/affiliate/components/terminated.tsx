import type { Affiliate } from '@tn-figueiredo/affiliate';
import { strings } from './strings';

interface Props { me: Affiliate }

export function Terminated({ me: _me }: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.terminated.title}</h1>
      <p>{strings.state.terminated.body}</p>
      <a href="mailto:suporte@brighttale.io" className="underline">
        {strings.state.terminated.support}
      </a>
    </div>
  );
}
