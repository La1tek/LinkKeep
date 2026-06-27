import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Favorites from './pages/Favorites'
import Settings from './pages/Settings'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import { ToastContainer, useToast } from './components/Toast'
import { ConfirmModal, openConfirm } from './components/ConfirmModal'
import { useTabStore } from './hooks/useTabStore'
import { api } from './lib/api'

export default function App() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTabId, setActiveTabId] = useState(null)
  const toast = useToast()

  const { tabs, create: createTab, remove: deleteTab, refresh: refreshTabs } = useTabStore()

  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('auth-expired', handler)
    return () => window.removeEventListener('auth-expired', handler)
  }, [logout])

  useEffect(() => {
    if (token) refreshTabs()
  }, [token, refreshTabs])

  if (!token) return (
    <>
      <Login />
      <ToastContainer />
    </>
  )

  const handleDeleteTab = async (id) => {
    const tab = (tabs || []).find(t => t.id === id)
    if (tab && tab.link_count > 0) {
      const result = await openConfirm({
        title: `Delete "${tab.name}"?`,
        message: `This tab has ${tab.link_count} ${tab.link_count === 1 ? 'link' : 'links'}.`,
        threeWay: true,
      })
      if (!result) return
      const keepLinks = result === 'keep_links'
      try {
        await api.deleteTab(id, keepLinks)
        await refreshTabs()
        if (activeTabId === id) setActiveTabId(null)
        toast.success(keepLinks ? 'Tab deleted, links kept' : 'Tab and links deleted')
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      const ok = await openConfirm({
        title: `Delete "${tab?.name || 'tab'}"?`,
        danger: true,
      })
      if (!ok) return
      try {
        await api.deleteTab(id, false)
        await refreshTabs()
        if (activeTabId === id) setActiveTabId(null)
        toast.success('Tab deleted')
      } catch (err) {
        toast.error(err.message)
      }
    }
  }

  return (
    <div className="flex min-h-[100dvh]" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Sidebar
        tabs={tabs || []}
        activeTabId={activeTabId}
        onSelectTab={(id) => { setActiveTabId(id); navigate('/') }}
        onCreateTab={createTab}
        onDeleteTab={handleDeleteTab}
        collapsed={false}
        onLogout={logout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AnimatePresence>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex-1 flex flex-col min-w-0"
          >
            <Routes location={location}>
              <Route
                path="/"
                element={<Dashboard token={token} user={user} onNavigate={navigate} initialTabId={activeTabId} />}
              />
              <Route path="/all" element={<Dashboard token={token} user={user} onNavigate={navigate} />} />
              <Route path="/favorites" element={<Favorites token={token} />} />
              <Route path="/settings" element={<Settings user={user} />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomNav activePath={location.pathname} onNavigate={navigate} />
      <ToastContainer />
      <ConfirmModal />
    </div>
  )
}
