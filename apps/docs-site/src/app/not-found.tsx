import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">Pagina nao encontrada</p>
      <Link
        href="/"
        className="mt-4 text-sm text-primary hover:underline"
      >
        Voltar ao inicio
      </Link>
    </div>
  )
}
