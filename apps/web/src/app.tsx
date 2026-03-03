import { Routes, Route } from 'react-router-dom';

function Home() {
  return (
    <main>
      <h1>Smithy AI Dashboard</h1>
      <p>Frontend dashboard coming soon.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
