/**
 * ComingSoon — placeholder for v0.2 admin pages whose backend is being built.
 * Each stub references its milestone card (M-XXX) so a curious admin can
 * see the spec.
 */
export function ComingSoon({
  title,
  card,
  description,
}: {
  title: string
  card: string
  description: string
}) {
  return (
    <div className="p-8">
      <div className="max-w-2xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
          {card} · em desenvolvimento
        </div>
        <h1 className="mb-3 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Spec completa em{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              docs/specs/v0.2-cards/{card}.md
            </code>
          </p>
        </div>
      </div>
    </div>
  )
}
