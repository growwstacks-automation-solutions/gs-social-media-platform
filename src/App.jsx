import React, { useEffect, useState } from 'react';
import { ToastProvider } from './components/Toast.jsx';
import { useCampaigns } from './hooks/useCampaigns.js';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PostCreator from './pages/PostCreator.jsx';
import Schedule from './pages/Schedule.jsx';
import AuthPage from './pages/AuthPage.jsx';
import LogsPage from './pages/LogsPage.jsx';
import PlatformPickerModal from './components/PlatformPickerModal.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'schedule',  label: 'Pipeline'  },
  // { id: 'logs',      label: 'Logs'      }
];

const SESSION_KEY = 'matix:session';

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Shell({ session, onLogout }) {
  const [page, setPage] = useState('dashboard');
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [composePlatforms, setComposePlatforms] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const data = useCampaigns();

  const handleNavigate = (id, recordId = null) => {
    if (recordId) setComposePlatforms([]);
    setSelectedRecordId(recordId);
    setPage(id);
    setMobileOpen(false);
  };

  const handleOpenPicker = () => setPickerOpen(true);

  const handlePickerConfirm = (platforms) => {
    setComposePlatforms(platforms);
    setSelectedRecordId(null);
    setPickerOpen(false);
    setPage('post-creator');
    setMobileOpen(false);
  };

  const handleClosePostCreator = () => {
    setPage('schedule');
    setSelectedRecordId(null);
    setComposePlatforms([]);
  };

  return (
    <div className="min-h-screen flex bg-cream-50 overflow-x-hidden relative">
      {pickerOpen && (
        <PlatformPickerModal
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerOpen(false)}
          initial={composePlatforms}
        />
      )}

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={`
        fixed top-0 left-0 bottom-0 w-60 z-50 transition-transform duration-300 ease-snap
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <Sidebar
          nav={NAV}
          current={page}
          onNavigate={handleNavigate}
          onCreate={handleOpenPicker}
          session={session}
          onLogout={onLogout}
        />
      </div>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-cream-100 border-b border-cream-300/60 flex items-center justify-between px-4 z-30">
        <div className="flex items-center">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 text-ink-700 hover:text-brand-700 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            onClick={() => handleNavigate('dashboard')}
            className="ml-2 h-display text-lg text-brand-700 font-bold hover:text-brand-800 transition-colors"
            aria-label="Go to dashboard"
          >
            GrowwStacks
          </button>
        </div>
        <button
          onClick={handleOpenPicker}
          className="bg-brand-gradient text-white font-bold rounded-lg px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 shadow-soft hover:shadow-lift transition-all"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Post
        </button>
      </div>

      <div className="flex-1 lg:ml-60 min-w-0 relative pt-14 lg:pt-0">
        <div key={page} className="animate-fade-up">
          {page === 'dashboard' && <Dashboard data={data} onNavigate={handleNavigate} onNewPost={handleOpenPicker} />}
          {page === 'schedule'  && <Schedule  data={data} onNavigate={handleNavigate} onNewPost={handleOpenPicker} />}
          {page === 'logs'      && <LogsPage  onNavigate={handleNavigate} />}
          {page === 'post-creator' && (
            <PostCreator
              data={data}
              onNavigate={handleNavigate}
              onClose={handleClosePostCreator}
              initialRecordId={selectedRecordId}
              composePlatforms={composePlatforms}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AuthGate() {
  const [session, setSession] = useState(() => readSession());

  // Reflect "/auth" vs "/" in the address bar — cosmetic since we have no router,
  // but matches the convention the rest of the app uses.
  useEffect(() => {
    const desiredPath = session ? '/' : '/auth';
    if (window.location.pathname !== desiredPath) {
      window.history.replaceState({}, '', desiredPath);
    }
  }, [session]);

  const handleLoggedIn = (s) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
    setSession(s);
  };

  const handleLogout = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setSession(null);
  };

  if (!session) return <AuthPage onLoggedIn={handleLoggedIn} />;
  return <Shell session={session} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  );
}
