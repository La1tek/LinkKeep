import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Favorites from './pages/Favorites'
import Settings from './pages/Settings'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { useTabs } from './hooks/useTabs'
import { api } from './lib/api'
import { useState, useCallback } from 'react'

export default function App() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTabId, setActiveTabId] = useState(null)

  // Sync tabs for sidebar
  const { tabs, create: createTab, remove: deleteTab, refresh: refreshTabs } = useTabs(token)

  // Listen for auth-expired events
  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('auth-expired', handler)
    return () => window.removeEventListener('auth-expired', handler)
  }, [logout])

  if (!token) return <Login />

  const handleDeleteTab = async (id) => {
    if (!confirm('Delete this tab and all its links?')) return
    await api.deleteTab(id)
    await refreshTabs()
    if (activeTabId === id) setActiveTabId(null)
  }

  return (
    <div className="flex min-h-[100dvh] bg-zinc-950 text-zinc-100">
      {/* Desktop sidebar */}
      <Sidebar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => { setActiveTabId(id); navigate('/') }}
        onCreateTab={createTab}
        onDeleteTab={handleDeleteTab}
        collapsed={false}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                token={token}
                user={user}
                onNavigate={navigate}
                initialTabId={activeTabId}
              />
            }
          />
          <Route path="/all" element={<Dashboard token={token} user={user} onNavigate={navigate} />} />
          <Route path="/favorites" element={<Favorites token={token} />} />
          <Route path="/settings" element={<Settings user={user} />} />
        </Routes>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav activePath={location.pathname} onNavigate={navigate} />
    </div>
  )
}
