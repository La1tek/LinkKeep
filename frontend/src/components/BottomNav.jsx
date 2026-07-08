import { motion } from 'framer-motion'
import { House, Star, MagnifyingGlass, GearSix, Trash } from '@phosphor-icons/react'

const navItems = [
  { path: '/', label: 'Home', icon: House },
  { path: '/favorites', label: 'Saved', icon: Star },
  { path: '/search', label: 'Search', icon: MagnifyingGlass },
  { path: '/trash', label: 'Trash', icon: Trash },
  { path: '/settings', label: 'Settings', icon: GearSix },
]

export default function BottomNav({ activePath, onNavigate }) {
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 glass pb-[env(safe-area-inset-bottom)]" style={{ borderTop: '1px solid var(--border-subtle)', boxShadow: '0 -18px 44px rgba(0,0,0,0.18)' }}>
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path + '/'))
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className="relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-2xl"
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: 'var(--accent-primary-soft)', border: '1px solid rgba(124,140,255,0.22)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                weight={active ? 'fill' : 'regular'}
                className="relative z-10 transition-colors"
                style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              />
              <span className="relative z-10 text-[10px] font-medium transition-colors" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
