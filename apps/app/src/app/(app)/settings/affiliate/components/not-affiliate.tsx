import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { strings } from './strings';

export function NotAffiliate() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.not_affiliate.title}</h1>
      <p>{strings.state.not_affiliate.body}</p>
      <Button asChild>
        <Link href="/settings/affiliate/apply">{strings.state.not_affiliate.cta}</Link>
      </Button>
    </div>
  );
}
