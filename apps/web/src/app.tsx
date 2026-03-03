import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import ShellLayout from './layouts/shell';

const DashboardPage = lazy(() => import('./pages/dashboard'));
const AssemblyLineListPage = lazy(() => import('./pages/assembly-line-list'));
const AssemblyLineCreatePage = lazy(() => import('./pages/assembly-line-create'));
const AssemblyLineDetailPage = lazy(() => import('./pages/assembly-line-detail'));
const WorkerPoolListPage = lazy(() => import('./pages/worker-pool-list'));
const WorkerPoolCreatePage = lazy(() => import('./pages/worker-pool-create'));
const WorkerPoolDetailPage = lazy(() => import('./pages/worker-pool-detail'));
const PackageListPage = lazy(() => import('./pages/package-list'));
const PackageDetailPage = lazy(() => import('./pages/packages/[id]'));
const WorkerListPage = lazy(() => import('./pages/worker-list'));
const WorkerCreatePage = lazy(() => import('./pages/worker-create'));
const WorkerDetailPage = lazy(() => import('./pages/worker-detail'));
const LogViewerPage = lazy(() => import('./pages/log-viewer'));
const FactoryPage = lazy(() => import('./pages/factory'));
const NotFoundPage = lazy(() => import('./pages/not-found'));

export function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="assembly-lines" element={<AssemblyLineListPage />} />
          <Route path="assembly-lines/create" element={<AssemblyLineCreatePage />} />
          <Route path="assembly-lines/:slug" element={<AssemblyLineDetailPage />} />
          <Route path="worker-pools" element={<WorkerPoolListPage />} />
          <Route path="worker-pools/create" element={<WorkerPoolCreatePage />} />
          <Route path="worker-pools/:slug" element={<WorkerPoolDetailPage />} />
          <Route path="packages" element={<PackageListPage />} />
          <Route path="packages/:id" element={<PackageDetailPage />} />
          <Route path="workers" element={<WorkerListPage />} />
          <Route path="workers/create" element={<WorkerCreatePage />} />
          <Route path="workers/:slug" element={<WorkerDetailPage />} />
          <Route path="logs" element={<LogViewerPage />} />
          <Route path="factory" element={<FactoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
