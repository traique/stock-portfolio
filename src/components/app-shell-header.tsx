'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Activity, ArrowRight, Cloud, CloudFog, CloudLightning,
  CloudRain, CloudSun, Droplets, Gem, LineChart,
  LogOut, Moon, Sun, ChevronDown
} from 'lucide-react';

type ThemeMode = 'light' | 'dark';

type Props = {
  title?: string;
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

// --- HELPERS ---
function getDisplayName(email?: string) {
  if (!email) return '';
  return email.split('@')[0] || email;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function getWeatherIcon(code: number | null) {
  if (code === null) return CloudSun;
  if ([0, 1].includes(code)) return Sun;
  if ([2].includes(code)) return CloudSun;
  if ([3].includes(code)) return Cloud;
  if ([45, 48].includes(code)) return CloudFog;
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return CloudRain;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return CloudSun;
}

export default function AppShellHeader({ email, isLoggedIn, currentTab, onLogout, onAuthOpen }: Props) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  
  const [infoLine, setInfoLine] = useState('');
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  // --- THEME ---
  useEffect(() => {
    const saved = localStorage.getItem('lcta_theme') as ThemeMode | null;
    if (saved) { setTheme(saved); document.documentElement.dataset.theme = saved; }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  // --- CLICK OUTSIDE MENUS ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) setToolsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- WEATHER & DATE FETCH ---
  useEffect(() => {
    async function buildInfo() {
      try {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solarText = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}`;
        
        const lunar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()).getLunar();
        const lunarText = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL`;

        const lat = 10.7769; // TP.HCM
        const lon = 106.7009;

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh`, { cache: 'no-store' });
        const data = await response.json();
        
        const temp = Math.round(Number(data?.current?.temperature_2m ?? 24));
        const code = Number.isFinite(Number(data?.current?.weather_code)) ? Number(data.current.weather_code) : null;
        
        setWeatherCode(code);
        setInfoLine(`${solarText} · ${lunarText} · TP.HCM ${temp}°C`);
      } catch {
        const now = new Date();
        setInfoLine(`${pad2(now.getDate())}/${pad2(now.getMonth() + 1)} · Lỗi thời tiết`);
        setWeatherCode(null);
      }
    }
    buildInfo();
  }, []);

  const WeatherIcon = useMemo(() => getWeatherIcon(weatherCode), [weatherCode]);

  // --- STYLES ---
  const tabStyle = (active: boolean) => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.04em',
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
      position: 'sticky', top: 4, zIndex: 1000, padding: '12px 16px', 
      background: 'var(--card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 24, border: '1px solid var(--border)', 
      display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16,
      boxShadow: 'var(--shadow-soft)'
    }}>
      {/* --- DÒNG TRÊN: LOGO & ACCOUNT --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LOGO */}
        <Link href="/" style={{ textDecoration: 'none', fontFamily: 'var(--font-brand)', fontSize: 24, letterSpacing: '0.25em', color: 'var(--text)', marginLeft: 4 }}>
          LCTA
        </Link>
        
        {/* RIGHT ACTIONS */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={toggleTheme} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--soft)', color: 'var(--text)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          
          <div ref={menuRef} style={{ position: 'relative' }}>
            {isLoggedIn ? (
              <button 
                onClick={() => setMenuOpen(!menuOpen)} 
                style={{ padding: '0 14px', height: 34, borderRadius: 100, border: '1px solid var(--border)', background: 'var(--soft)', fontSize: 12, fontWeight: 800, color: 'var(--text)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
              >
                {getDisplayName(email)}
              </button>
            ) : (
              <button 
                onClick={onAuthOpen} 
                style={{ padding: '0 16px', height: 34, borderRadius: 100, background: 'var(--text)', color: 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
              >
                SIGN IN
              </button>
            )}

            {/* DROPDOWN ACCOUNT */}
            {menuOpen && isLoggedIn && (
              <div style={{ 
                position: 'absolute', top: '100%', right: 0, marginTop: 8, 
                background: 'var(--card)', border: '1px solid var(--border)', 
                borderRadius: 16, padding: '12px', minWidth: 180, 
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                boxShadow: 'var(--shadow-strong)', zIndex: 9999
              }}>
                <div style={{ fontWeight: 800, color: 'var(--text)', padding: '0 4px' }}>{getDisplayName(email)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', padding: '0 4px', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>{email}</div>
                
                <button 
                  onClick={onLogout} 
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', width: '100%', padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 800, transition: 'background 0.2s' }}
                >
                  <LogOut size={14} /> ĐĂNG XUẤT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- DÒNG DƯỚI: MENU TAB & THỜI TIẾT --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        
        {/* NAV TABS */}
        <nav style={{ display: 'flex', gap: 4 }}>
          <Link href="/" style={tabStyle(currentTab === 'home')}>HOME</Link>
          <Link href="/dashboard" style={tabStyle(currentTab === 'dashboard')}>DANH MỤC</Link>
          
          <div style={{ position: 'relative' }} ref={toolsRef}>
            <button onClick={() => setToolsOpen(!toolsOpen)} style={tabStyle(isToolActive)}>
              TIỆN ÍCH 
              <ChevronDown size={14} style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 2 }} />
            </button>
            
            {/* DROPDOWN TIỆN ÍCH */}
            {toolsOpen && (
              <div style={{ 
                position: 'absolute', top: '100%', left: 0, marginTop: 8, 
                background: 'var(--card)', border: '1px solid var(--border)', 
                borderRadius: 16, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, 
                minWidth: 160, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                boxShadow: 'var(--shadow-strong)'
              }}>
                <Link href="/system-live" style={{ padding: '10px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--text)', borderRadius: 12, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>TOP BUY/SELL</Link>
                <Link href="/backtest" style={{ padding: '10px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--text)', borderRadius: 12, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>BACKTEST</Link>
                <Link href="/gold" style={{ padding: '10px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--text)', borderRadius: 12, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>GIÁ VÀNG</Link>
                <Link href="/oil" style={{ padding: '10px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--text)', borderRadius: 12, transition: 'background 0.2s' }} onClick={() => setToolsOpen(false)}>GIÁ XĂNG</Link>
              </div>
            )}
          </div>
        </nav>

        {/* WEATHER PILL (DÙNG FONT MANROPE CHO CON SỐ) */}
        <div className="num-premium" style={{ 
          display: 'flex', alignItems: 'center', gap: 6, 
          padding: '6px 14px', background: 'var(--soft)', 
          border: '1px solid var(--border)', borderRadius: 100, 
          fontSize: 11, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap',
          letterSpacing: '0.02em'
        }}>
          <WeatherIcon size={14} color="var(--text)" strokeWidth={2.5} />
          <span>{infoLine || 'ĐANG TẢI...'}</span>
        </div>

      </div>
    </header>
  );
}
