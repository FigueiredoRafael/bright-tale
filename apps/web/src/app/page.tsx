export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '4rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>BrightTale</h1>
      <p>AI-powered content creation workflow.</p>
      <a href={process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.brighttale.io'}>
        Open App →
      </a>
    </main>
  );
}
