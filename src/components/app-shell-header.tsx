'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Moon, Sun, ChevronDown, LogOut, ArrowRight } from 'lucide-react';

export default function AppShellHeader({ email, isLoggedIn, currentTab, onLogout, onAuthOpen }: any) {
  const [theme, setTheme] = useState('light');
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('lcta_theme');
    if (saved) { setTheme(saved); document.documentElement.dataset.theme = saved; }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  const tabStyle = (active: boolean) => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--text)' : 'var(--muted)',
    background: active ? 'var(--card)' : 'transparent',
    borderRadius: 100,
    textDecoration: 'none',
    transition: '0.3s',
    border: active ? '1px solid var(--border)' : '1px solid transparent'
  });

  return (
    <header style={{ 
      position: 'sticky', top: 4, zIndex: 1000, padding: '10px 16px', 
      background: 'var(--card)', backdropFilter: 'blur(20px)', 
      borderRadius: 24, border: '1px solid var(--border)', 
      display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none', fontFamily: 'var(--font-brand)', fontSize: 22, letterSpacing: '0.3em', color: 'var(--text)' }}>
          LCTA
        </Link>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {isLoggedIn ? (
            <button onClick={onLogout} style={{ padding: '0 12px', borderRadius: 100, border: '1px solid var(--border)', background: 'transparent', fontSize: 12, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
              LOGOUT
            </button>
          ) : (
            <button onClick={onAuthOpen} style={{ padding: '0 12px', borderRadius: 100, background: 'var(--text)', color: 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              SIGN IN
            </button>
          )}
        </div>
      </div>

      <nav style={{ display: 'flex', gap: 4 }}>
        <Link href="/" style={tabStyle(currentTab === 'home')}>HOME</Link>
        <Link href="/dashboard" style={tabStyle(currentTab === 'dashboard')}>DANH MỤC</Link>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setToolsOpen(!toolsOpen)} style={tabStyle(['gold', 'oil'].includes(currentTab))}>
            TIỆN ÍCH <ChevronDown size={12} />
          </button>
          {toolsOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', minWidth: 140, backdropFilter: 'blur(20px)' }}>
              <Link href="/gold" style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)' }} onClick={() => setToolsOpen(false)}>GIÁ VÀNG</Link>
              <Link href="/oil" style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)' }} onClick={() => setToolsOpen(false)}>GIÁ XĂNG</Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
