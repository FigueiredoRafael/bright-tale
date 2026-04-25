'use client';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
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
          500
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
          Algo deu errado
        </h1>
        <p
          style={{
            margin: '0 0 8px',
            color: '#8b98b0',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
        >
          Ocorreu um erro inesperado. Tente novamente ou volte ao início.
        </p>
        {error.digest && (
          <p
            style={{
              margin: '0 0 32px',
              color: '#8b98b0',
              fontSize: '12px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            ID: {error.digest}
          </p>
        )}
        {!error.digest && <div style={{ marginBottom: '32px' }} />}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px',
              border: '1px solid #22d3ee',
              borderRadius: '8px',
              background: 'transparent',
              color: '#22d3ee',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              border: '1px solid #263146',
              borderRadius: '8px',
              color: '#8b98b0',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </main>
  );
}
