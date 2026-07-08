import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkle } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'
import BrandIcon from '../components/BrandIcon'

export default function Login() {
  const { login, register, loading, error } = useAuth()
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (mode === 'login') await login(username, password)
      else await register(username, password)
    } catch {}
  }

  return (
    <div className="cosmos-shell min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-20 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(124,140,255,0.38), transparent)' }} />
      <div className="absolute left-8 top-16 hidden h-32 w-48 sm:block">
        <span className="star-node absolute left-2 top-20 h-2 w-2 rounded-full" style={{ background: 'var(--accent-primary)' }} />
        <span className="star-node absolute left-24 top-4 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent-mint)' }} />
        <span className="star-node absolute right-3 bottom-3 h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent-amber)' }} />
        <span className="absolute left-4 top-20 h-px w-28 rotate-[-32deg]" style={{ background: 'linear-gradient(90deg, rgba(124,140,255,0.45), transparent)' }} />
        <span className="absolute left-24 top-6 h-px w-28 rotate-[28deg]" style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.35), transparent)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <BrandIcon className="atlas-login-icon mb-4" />
          <div className="metadata-line text-[10px] uppercase mb-1 inline-flex items-center gap-1"><Sparkle size={11} /> quiet observatory</div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>LinkAtlas</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Save, organize, and search your links</p>
        </div>

        <div className="atlas-panel rounded-[1.35rem] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="metadata-line text-xs font-medium">Username</label>
              <input id="login-username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username" className="input-base w-full rounded-2xl px-4 py-3 text-sm outline-none" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="metadata-line text-xs font-medium">Password</label>
              <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" className="input-base w-full rounded-2xl px-4 py-3 text-sm outline-none" />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full text-white py-3 rounded-2xl text-sm font-medium hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-mint))', boxShadow: '0 18px 42px rgba(124,140,255,0.24)' }}>
              {loading ? 'Please wait...' : (<>{mode === 'login' ? 'Sign In' : 'Create Account'}<ArrowRight size={15} /></>)}
            </button>
          </form>
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="w-full text-center text-xs mt-4 transition-colors hover:text-accent-400" style={{ color: 'var(--text-muted)' }}>
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
          </button>
        </div>
        <p className="text-center text-[10px] mt-6 font-mono" style={{ color: 'var(--text-muted)' }}>LinkAtlas v2.7</p>
      </motion.div>
    </div>
  )
}
