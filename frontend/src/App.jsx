import { Navigate, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Home from './pages/Home'
import Folder from './pages/Folder'
import Favorites from './pages/Favorites'
import Settings from './pages/Settings'
import Search from './pages/Search'
import Duplicates from './pages/Duplicates'
import Shares from './pages/Shares'
import Recommendations from './pages/Recommendations'
import Admin from './pages/Admin'
import PublicShare from './pages/PublicShare'
import PublicProfile from './pages/PublicProfile'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import FolderLockModal from './components/FolderLockModal'
import { ToastContainer, useToast } from './components/Toast'
import { ConfirmModal, openConfirm } from './components/ConfirmModal'
import { useTabStore } from './hooks/useTabStore'
import { api } from './lib/api'

function getSlideDirection(pathname) {
  // Deeper paths slide left, going back slides right
  const depth = pathname === '/' ? 0 : pathname.startsWith('/folder') || pathname === '/favorites' || pathname === '/search' ? 1 : pathname === '/settings' ? 1 : 0
  return depth
}

export default function App() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [adminAvailable, setAdminAvailable] = useState(null)
  const [folderLockModal, setFolderLockModal] = useState(null)

  const { tabs, create: createTab, remove: deleteTab, refresh: refreshTabs } = useTabStore()

  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('auth-expired', handler)
    return () => window.removeEventListener('auth-expired', handler)
  }, [logout])

  useEffect(() => {
    if (token) refreshTabs()
  }, [token, refreshTabs])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setAdminAvailable(null)
      return () => { cancelled = true }
    }
    setAdminAvailable(null)
    api.adminOverview()
      .then(() => { if (!cancelled) setAdminAvailable(true) })
      .catch(() => { if (!cancelled) setAdminAvailable(false) })
    return () => { cancelled = true }
  }, [token])

  if (location.pathname.startsWith('/share/')) return (
    <>
      <PublicShare />
      <ToastContainer />
    </>
  )

  if (location.pathname.startsWith('/profile/')) return (
    <>
      <PublicProfile />
      <ToastContainer />
    </>
  )

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
        message: `This folder has ${tab.link_count} ${tab.link_count === 1 ? 'link' : 'links'}.`,
        threeWay: true,
      })
      if (!result) return
      const keepLinks = result === 'keep_links'
      try {
        await api.deleteTab(id, keepLinks)
        await refreshTabs()
        toast.success(keepLinks ? 'Folder deleted, links kept' : 'Folder and links deleted')
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      const ok = await openConfirm({
        title: `Delete "${tab?.name || 'folder'}"?`,
        danger: true,
      })
      if (!ok) return
      try {
        await api.deleteTab(id, false)
        await refreshTabs()
        toast.success('Folder deleted')
      } catch (err) {
        toast.error(err.message)
      }
    }
  }

  const handleDropLinks = async ({ linkIds, tabId, tabName }) => {
    const ids = [...new Set((linkIds || []).map(Number).filter(Boolean))]
    if (!ids.length || !tabId) return
    try {
      await api.bulkAction(ids, 'move', Number(tabId))
      await refreshTabs()
      window.dispatchEvent(new CustomEvent('linkkeep-links-moved', { detail: { linkIds: ids, tabId: Number(tabId) } }))
      toast.success(`${ids.length} ${ids.length === 1 ? 'link' : 'links'} moved to ${tabName || 'folder'}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="cosmos-shell flex min-h-[100dvh]" style={{ color: 'var(--text-primary)' }}>
      <div className="animated-sky" aria-hidden="true">
        <span className="comet comet-one" />
        <span className="comet comet-two" />
        <span className="comet comet-three" />
      </div>
      <Sidebar
        tabs={tabs || []}
        activePath={location.pathname}
        adminAvailable={adminAvailable === true}
        onSelectTab={(id) => navigate(`/folder/${id}`)}
        onSelectAll={() => navigate('/folder/all')}
        onSelectFavorites={() => navigate('/favorites')}
        onCreateTab={createTab}
        onDeleteTab={handleDeleteTab}
        onUnlockTab={(tab) => setFolderLockModal({ tab, mode: 'unlock' })}
        onDropLinks={handleDropLinks}
        onLogout={logout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="flex-1 flex flex-col min-w-0"
          >
            <Routes location={location}>
              <Route path="/" element={<Home token={token} />} />
              <Route path="/folder/:id" element={<Folder token={token} />} />
              <Route path="/favorites" element={<Favorites token={token} />} />
              <Route path="/search" element={<Search token={token} />} />
              <Route path="/duplicates" element={<Duplicates token={token} />} />
              <Route path="/shares" element={<Shares />} />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/admin" element={adminAvailable === false ? <Navigate to="/settings" replace /> : <Admin />} />
              <Route path="/settings" element={<Settings user={user} adminAvailable={adminAvailable === true} />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomNav activePath={location.pathname} onNavigate={navigate} />
      <FolderLockModal
        open={!!folderLockModal}
        tab={folderLockModal?.tab}
        mode={folderLockModal?.mode || 'unlock'}
        onClose={() => setFolderLockModal(null)}
        onSuccess={() => refreshTabs()}
      />
      <ToastContainer />
      <ConfirmModal />
    </div>
  )
}
