import { Routes, Route } from 'react-router-dom';
import ShellLayout from './layouts/shell';

function Placeholder({ title }: { title: string }) {
  return <h2 className="text-xl font-semibold">{title}</h2>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route index element={<Placeholder title="Dashboard" />} />
        <Route path="assembly-lines" element={<Placeholder title="Assembly Lines" />} />
        <Route path="worker-pools" element={<Placeholder title="Worker Pools" />} />
        <Route path="packages" element={<Placeholder title="Packages" />} />
        <Route path="workers" element={<Placeholder title="Workers" />} />
        <Route path="logs" element={<Placeholder title="Logs" />} />
        <Route path="factory" element={<Placeholder title="Factory" />} />
      </Route>
    </Routes>
  );
}
