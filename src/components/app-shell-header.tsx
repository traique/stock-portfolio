'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { Moon, Sun, ChevronDown } from 'lucide-react';

type Props = {
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

export default function AppShellHeader({ email, isLoggedIn, currentTab, onLogout, onAuthOpen }: Props) {
  const [theme, setTheme] = useState('light');
  const [toolsOpen, setToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Khôi phục theme từ local storage
  useEffect(() => {
    const saved = localStorage.getItem('lcta_theme');
    if (saved) { 
      setTheme(saved); 
      document.documentElement.dataset.theme = saved; 
    }
  }, []);

  // Đóng menu khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  // Nút điều hướng phong cách Tối giản
  const tabStyle = (active: boolean) => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--text)' : 'var(--muted)',
    background: active ? 'var(--card)' : 'transparent',
    borderRadius: 100,
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    border: active ? '1px solid var(--border)' : '1px solid transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer'
  });

  const isToolActive = ['gold', 'oil', 'system-live', 'backtest'].includes(currentTab);

  return (
    <header style={{ 
      position: 'sticky', top: 4, zIndex: 1000, padding: '10px 16px', 
      background: 'var(--card)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderRadius: 24, border: '1px solid var(--border)', 
      display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LOGO MONOGRAM */}
        <Link href="/" style={{ textDecoration: 'none', fontFamily: 'var(--font-brand)', fontSize: 22, letterSpacing: '0.25em', color: 'var(--text)', marginLeft: 4 }}>
          LCTA
        </Link>
        
        {/* KHU VỰC ACCOUNT & THEME */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTheme} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--soft)', color: 'var(--text)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          
          {isLoggedIn ? (
            <button onClick={onLogout} style={{ padding: '0 14px', borderRadius: 100, border: '1px solid var(--border)', background: 'var(--soft)', fontSize: 12, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
              LOGOUT
            </button>
          ) : (
            <button onClick={onAuthOpen} style={{ padding: '0 14px', borderRadius: 100, background: 'var(--text)', color: 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              SIGN IN
            </button>
          )}
        </div>
      </div>

      {/* THANH MENU ĐIỀU HƯỚNG */}
      <nav style={{ display: 'flex', gap: 4 }}>
        <Link href="/" style={tabStyle(currentTab === 'home')}>HOME</Link>
        <Link href="/dashboard" style={tabStyle(currentTab === 'dashboard')}>DANH MỤC</Link>
        
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button onClick={() => setToolsOpen(!toolsOpen)} style={tabStyle(isToolActive)}>
            TIỆN ÍCH 
            <ChevronDown size={14} style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 2 }} />
          </button>
          
          {/* MENU DROPDOWN LUXURY */}
          {toolsOpen && (
            <div style={{ 
              position: 'absolute', top: '100%', left: 0, marginTop: 8, 
              background: 'var(--card)', border: '1px solid var(--border)', 
              borderRadius: 16, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, 
              minWidth: 160, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.1)'
            }}>
              <Link href="/system-live" style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)', borderRadius: 10, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>
                TOP BUY/SELL
              </Link>
              <Link href="/backtest" style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)', borderRadius: 10, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>
                BACKTEST
              </Link>
              <Link href="/gold" style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)', borderRadius: 10, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>
                GIÁ VÀNG
              </Link>
              <Link href="/oil" style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)', borderRadius: 10, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>
                GIÁ XĂNG
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
