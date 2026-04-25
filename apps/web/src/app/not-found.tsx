import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#0a0e1a',
      }}
    >
      <div
        style={{
          background: '#121826',
          border: '1px solid #263146',
          borderRadius: '14px',
          padding: '48px 40px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '96px',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#22d3ee',
            marginBottom: '16px',
          }}
        >
          404
        </div>
        <h1
          style={{
            margin: '0 0 12px',
            fontSize: '22px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#fff',
          }}
        >
          Página não encontrada
        </h1>
        <p
          style={{
            margin: '0 0 32px',
            color: '#8b98b0',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            border: '1px solid #22d3ee',
            borderRadius: '8px',
            color: '#22d3ee',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
