'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSun,
  Sun, Moon, LogOut, ChevronDown,
} from 'lucide-react';

// ================= TYPES =================

type ThemeMode = 'light' | 'dark';

type Props = {
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

// ================= HELPERS =================

function getDisplayName(email?: string): string {
  if (!email) return '';
  return email.split('@')[0] || email;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getWeatherIcon(code: number | null) {
  if (code === null)                                               return CloudSun;
  if (code === 0 || code === 1)                                   return Sun;
  if (code === 2)                                                  return CloudSun;
  if (code === 3)                                                  return Cloud;
  if (code === 45 || code === 48)                                  return CloudFog;
  if ([51,53,55,61,63,65,80,81,82].includes(code))                return CloudRain;
  if ([95, 96, 99].includes(code))                                 return CloudLightning;
  return CloudSun;
}

// ================= STATIC STYLES =================
// Defined outside the component so they are created once, not on every render.

const HEADER_STYLE: React.CSSProperties = {
  position: 'sticky',
  top: 4,
  zIndex: 1000,
  padding: '12px 16px',
  background: 'var(--card)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderRadius: 24,
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  boxShadow: 'var(--shadow-soft)',
};

const TOP_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const LOGO_STYLE: React.CSSProperties = {
  textDecoration: 'none',
  fontFamily: 'var(--font-brand)',
  fontSize: 24,
  letterSpacing: '0.25em',
  color: 'var(--text)',
  marginLeft: 4,
};

const ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
};

const THEME_BTN_STYLE: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '1px solid var(--border)',
  background: 'var(--soft)',
  color: 'var(--text)',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
};

const ACCOUNT_BTN_STYLE: React.CSSProperties = {
  padding: '0 12px',
  height: 32,
  borderRadius: 100,
  border: '1px solid var(--border)',
  background: 'var(--soft)',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--text)',
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 8,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 12,
  minWidth: 180,
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  boxShadow: 'var(--shadow-strong)',
  zIndex: 9999,
};

const LOGOUT_BTN_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--red)',
  background: 'rgba(244, 63, 94, 0.10)',
  border: '1px solid rgba(244, 63, 94, 0.20)',
  width: '100%',
  padding: '8px 12px',
  borderRadius: 12,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
};

const BOTTOM_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap-reverse',
  gap: 12,
};

const NAV_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
};

const TOOLS_DROPDOWN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 8,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 160,
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  boxShadow: 'var(--shadow-strong)',
  zIndex: 9999,
};

const TOOL_LINK_STYLE: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textDecoration: 'none',
  color: 'var(--text)',
  borderRadius: 12,
};

const WEATHER_PILL_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  background: 'var(--soft)',
  border: '1px solid var(--border)',
  borderRadius: 100,
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};

// ================= COMPONENT =================

export default function AppShellHeader({
  email,
  isLoggedIn,
  currentTab,
  onLogout,
  onAuthOpen,
}: Props) {
  const [theme, setTheme]       = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [infoLine, setInfoLine] = useState('');
  const [weatherCode, setWeatherCode] = useState<number | null>(null);

  const menuRef  = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  // --- THEME ---
  useEffect(() => {
    const saved = localStorage.getItem('lcta_theme') as ThemeMode | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  // --- CLICK OUTSIDE ---
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current  && !menuRef.current.contains(e.target as Node))  setMenuOpen(false);
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- WEATHER & DATE — with AbortController to prevent setState on unmount ---
  useEffect(() => {
    const controller = new AbortController();

    async function buildInfo() {
      try {
        const now      = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday  = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solarText = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}`;
        const lunar    = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()).getLunar();
        const lunarText = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL`;

        const res  = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=10.7769&longitude=106.7009&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh',
          { signal: controller.signal, cache: 'no-store' },
        );
        const data = await res.json();
        const temp = Math.round(Number(data?.current?.temperature_2m ?? 24));
        const code = Number.isFinite(Number(data?.current?.weather_code))
          ? Number(data.current.weather_code)
          : null;

        setWeatherCode(code);
        setInfoLine(`${solarText} · ${lunarText} · TP.HCM ${temp}°C`);
      } catch (err: unknown) {
        // Ignore abort errors — component unmounted
        if (err instanceof Error && err.name === 'AbortError') return;
        const now = new Date();
        setInfoLine(`${pad2(now.getDate())}/${pad2(now.getMonth() + 1)} · TP.HCM 28°C`);
      }
    }

    buildInfo();
    return () => controller.abort();
  }, []);

  // --- MEMOISED VALUES ---
  const WeatherIcon  = useMemo(() => getWeatherIcon(weatherCode), [weatherCode]);
  const isToolActive = useMemo(
    () => ['gold', 'oil', 'system-live', 'backtest'].includes(currentTab),
    [currentTab],
  );

  // Tab style is data-driven — memoised to avoid object creation on every render
  const tabStyle = useMemo(
    () => (active: boolean): React.CSSProperties => ({
      padding: '6px 14px',
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: active ? 'var(--text)' : 'var(--muted)',
      background: active ? 'var(--tab-active-bg)' : 'transparent',
      borderRadius: 100,
      textDecoration: 'none',
      transition: 'all 0.2s ease',
      border: active ? '1px solid var(--tab-active-border)' : '1px solid transparent',
      boxShadow: active ? 'var(--tab-active-shadow)' : 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }),
    [],
  );

  return (
    <header style={HEADER_STYLE}>

      {/* --- ROW 1: LOGO & ACCOUNT --- */}
      <div style={TOP_ROW_STYLE}>
        <Link href="/" style={LOGO_STYLE}>LCTA</Link>

        <div style={ACTIONS_STYLE}>
          {/* Theme toggle */}
          <button onClick={toggleTheme} style={THEME_BTN_STYLE} aria-label="Đổi giao diện">
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          {/* Account menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            {isLoggedIn ? (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                style={ACCOUNT_BTN_STYLE}
              >
                {getDisplayName(email)}
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onAuthOpen?.(); }}
                style={ACCOUNT_BTN_STYLE}
              >
                SIGN IN
              </button>
            )}

            {menuOpen && isLoggedIn && (
              <div style={DROPDOWN_STYLE}>
                <div style={{ fontWeight: 800, color: 'var(--text)', padding: '0 4px', fontSize: 13 }}>
                  {getDisplayName(email)}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--muted)', padding: '0 4px',
                  marginBottom: 12, paddingBottom: 12,
                  borderBottom: '1px solid var(--border)', wordBreak: 'break-all',
                }}>
                  {email}
                </div>
                <button onClick={onLogout} style={LOGOUT_BTN_STYLE}>
                  <LogOut size={14} /> ĐĂNG XUẤT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- ROW 2: NAV TABS & WEATHER --- */}
      <div style={BOTTOM_ROW_STYLE}>

        <nav style={NAV_STYLE}>
          <Link href="/"          style={tabStyle(currentTab === 'home')}>HOME</Link>
          <Link href="/dashboard" style={tabStyle(currentTab === 'dashboard')}>DANH MỤC</Link>

          {/* Tools dropdown */}
          <div style={{ position: 'relative' }} ref={toolsRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setToolsOpen(v => !v); }}
              style={tabStyle(isToolActive)}
            >
              TIỆN ÍCH
              <ChevronDown
                size={14}
                style={{
                  transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  marginLeft: 2,
                }}
              />
            </button>

            {toolsOpen && (
              <div style={TOOLS_DROPDOWN_STYLE}>
                <Link href="/system-live" style={TOOL_LINK_STYLE} onClick={() => setToolsOpen(false)}>TOP BUY/SELL</Link>
                <Link href="/backtest"    style={TOOL_LINK_STYLE} onClick={() => setToolsOpen(false)}>BACKTEST</Link>
                <Link href="/gold"        style={TOOL_LINK_STYLE} onClick={() => setToolsOpen(false)}>GIÁ VÀNG</Link>
                <Link href="/oil"         style={TOOL_LINK_STYLE} onClick={() => setToolsOpen(false)}>GIÁ XĂNG</Link>
              </div>
            )}
          </div>
        </nav>

        {/* Weather pill */}
        <div className="num-premium" style={WEATHER_PILL_STYLE}>
          <WeatherIcon size={14} color="var(--text)" strokeWidth={2.5} />
          <span>{infoLine || 'ĐANG TẢI...'}</span>
        </div>

      </div>
    </header>
  );
}
