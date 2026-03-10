import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { socketManager } from '@/api/socket';
import { useAppStore } from '@/stores/app.store';

export default function ShellLayout() {
  useEffect(() => {
    socketManager.connect();
    const unsubscribe = socketManager.onStateChange((state) => {
      useAppStore.getState().setSocketState(state);
    });
    return () => {
      unsubscribe();
      socketManager.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
