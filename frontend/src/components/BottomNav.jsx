import { motion } from 'framer-motion'
import { House, Star, Stack, GearSix } from '@phosphor-icons/react'

const navItems = [
  { path: '/', label: 'Home', icon: House },
  { path: '/all', label: 'All', icon: Stack },
  { path: '/favorites', label: 'Saved', icon: Star },
  { path: '/settings', label: 'Settings', icon: GearSix },
]

export default function BottomNav({ activePath, onNavigate }) {
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 glass pb-[env(safe-area-inset-bottom)]" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activePath === item.path
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className="relative flex flex-col items-center gap-0.5 px-4 py-1.5"
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'rgba(99, 102, 241, 0.1)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                weight={active ? 'fill' : 'regular'}
                className="relative z-10 transition-colors"
                style={{ color: active ? '#818cf8' : 'var(--text-muted)' }}
              />
              <span className="relative z-10 text-[10px] font-medium transition-colors" style={{ color: active ? '#818cf8' : 'var(--text-muted)' }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
