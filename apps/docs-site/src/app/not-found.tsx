export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>404</h1>
        <p style={{ color: '#666' }}>Page not found</p>
        <a href="/" style={{ marginTop: '1rem', color: '#0070f3', textDecoration: 'none' }}>← Back home</a>
      </body>
    </html>
  );
}
