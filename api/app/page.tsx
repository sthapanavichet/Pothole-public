export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>Pothole API</h1>
      <p>Backend for storing pothole images, JSON metadata, and report status.</p>
      <ul>
        <li><code>GET /api/health</code></li>
        <li><code>GET /api/reports</code></li>
        <li><code>POST /api/reports</code></li>
        <li><code>GET /api/reports/:id</code></li>
        <li><code>PATCH /api/reports/:id</code></li>
        <li><code>DELETE /api/reports/:id</code></li>
      </ul>
    </main>
  );
}
