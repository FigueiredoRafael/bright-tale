import type { ClickByPlatform } from '@/lib/affiliate-api';
import { strings } from './strings';

interface Props { items: ClickByPlatform[] }

export function ClicksByPlatform({ items }: Props) {
  if (items.length === 0) return null; // hides when empty per spec §2
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.clicks_by_platform.section_title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th>Plataforma</th><th>Cliques</th><th>Conversões</th></tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.sourcePlatform} className="border-t">
              <td className="py-2">{r.sourcePlatform}</td>
              <td className="py-2">{r.clicks}</td>
              <td className="py-2">{r.conversions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
