'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Activity,
  ArrowRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gem,
  LineChart,
  LogOut,
  Moon,
  Sun,
  ChevronDown
} from 'lucide-react';

type ThemeMode = 'light' | 'dark';

type Props = {
  title: string; // Vẫn giữ prop này để code cũ không bị lỗi, nhưng ta sẽ giấu nó đi
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

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

  useEffect(() => {
    const savedTheme = localStorage.getItem('alphaboard_theme') as ThemeMode | null;
    const nextTheme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function buildInfo() {
      try {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solarText = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}`;
        
        const lunar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()).getLunar();
        const lunarText = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL`;

        const lat = 10.7769;
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

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('alphaboard_theme', nextTheme);
  }

  const isToolActive = ['system-live', 'backtest', 'gold', 'oil'].includes(currentTab);

  // Style chuẩn Minimalism cho Tab: Không icon, chữ in hoa, giãn cách
  const getTabStyle = (isActive: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 14px',
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    textDecoration: 'none',
    background: isActive ? 'var(--tab-active-bg)' : 'transparent',
    color: isActive ? 'var(--text)' : 'var(--muted)',
    border: `1px solid ${isActive ? 'var(--tab-active-border)' : 'transparent'}`,
    boxShadow: isActive ? 'var(--tab-active-shadow)' : 'none',
    backdropFilter: isActive ? 'blur(10px)' : 'none',
    WebkitBackdropFilter: isActive ? 'blur(10px)' : 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    fontFamily: 'inherit'
  });

  return (
    <header 
      style={{
        position: 'sticky',
        top: 2, 
        zIndex: 1000,
        background: theme === 'dark' ? 'rgba(11, 17, 33, 0.7)' : 'rgba(255, 255, 255, 0.65)', 
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid var(--border)',
        boxShadow: theme === 'dark' ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 30px rgba(31, 38, 135, 0.04)',
        borderRadius: 24, 
        padding: '10px 14px',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'background 0.3s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        
        {/* LOGO LUXURY MONOGRAM CÓ LINK VỀ HOME */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <span style={{ 
            fontSize: 20, 
            fontWeight: 900, 
            fontFamily: '"Playfair Display", serif',
            letterSpacing: '0.25em', 
            color: 'var(--text)',
            marginLeft: 4
          }}>
            LCTA
          </span>
        </Link>

        {/* BỎ HẲN CÁC TIÊU ĐỀ RƯỜM RÀ NHƯ "RADAR ĐẦU TƯ" Ở ĐÂY */}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button 
            onClick={toggleTheme} 
            style={{ background: 'var(--soft)', border: '1px solid var(--border)', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', cursor: 'pointer' }}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            {isLoggedIn ? (
              <button 
                type="button" 
                onClick={() => setMenuOpen((prev) => !prev)} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 100, 
                  background: 'var(--soft)', 
                  color: 'var(--text)', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', margin: 0 
                }}
              >
                <span>{getDisplayName(email)}</span>
              </button>
            ) : (
              <button 
                type="button" 
                onClick={onAuthOpen} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 100, 
                  background: 'var(--soft)', 
                  color: 'var(--text)', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', margin: 0 
                }}
              >
                <span>Đăng nhập</span>
                <ArrowRight size={14} />
              </button>
            )}

            {menuOpen && isLoggedIn && (
              <div className="ab-account-menu premium" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 9999, minWidth: 160, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 8, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', backdropFilter: 'blur(20px)' }}>
                <div className="ab-account-name" style={{ padding: '4px 8px', fontWeight: 700 }}>{getDisplayName(email)}</div>
                <div className="ab-account-email" style={{ padding: '0 8px 8px 8px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{email}</div>
                <button type="button" className="ab-menu-btn danger" onClick={onLogout} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer', width: '100%', padding: '8px', textAlign: 'left', borderRadius: 8 }}>
                  <LogOut size={16} />
                  <span style={{ fontWeight: 600 }}>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        
        {/* MENU TỐI GIẢN */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Link href="/" style={getTabStyle(currentTab === 'home')}>
            <span>HOME</span>
          </Link>
          <Link href="/dashboard" style={getTabStyle(currentTab === 'dashboard')}>
            <span>DANH MỤC</span>
          </Link>

          <div ref={toolsRef} style={{ position: 'relative' }}>
            <button 
              type="button" 
              onClick={() => setToolsOpen(!toolsOpen)}
              style={{ ...getTabStyle(isToolActive), paddingRight: 10 }}
            >
              <span>TIỆN ÍCH</span>
              <ChevronDown size={14} style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 2, color: 'var(--muted)' }} />
            </button>

            {toolsOpen && (
              <div 
                className="ab-tools-dropdown"
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 8, background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 16, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, 
                  zIndex: 99999, 
                  boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                  backdropFilter: 'blur(20px)'
                }}
              >
                <Link href="/system-live" className="ab-menu-btn" style={{ justifyContent: 'flex-start', color: 'var(--text)', textDecoration: 'none', background: 'transparent', border: 'none' }} onClick={() => setToolsOpen(false)}>
                  <Activity size={15} color="var(--muted)" /> <span style={{ fontWeight: 600 }}>Top Buy/Sell</span>
                </Link>
                <Link href="/backtest" className="ab-menu-btn" style={{ justifyContent: 'flex-start', color: 'var(--text)', textDecoration: 'none', background: 'transparent', border: 'none' }} onClick={() => setToolsOpen(false)}>
                  <LineChart size={15} color="var(--muted)" /> <span style={{ fontWeight: 600 }}>Backtest</span>
                </Link>
                <Link href="/gold" className="ab-menu-btn" style={{ justifyContent: 'flex-start', color: 'var(--text)', textDecoration: 'none', background: 'transparent', border: 'none' }} onClick={() => setToolsOpen(false)}>
                  <Gem size={15} color="var(--muted)" /> <span style={{ fontWeight: 600 }}>Giá Vàng</span>
                </Link>
                <Link href="/oil" className="ab-menu-btn" style={{ justifyContent: 'flex-start', color: 'var(--text)', textDecoration: 'none', background: 'transparent', border: 'none' }} onClick={() => setToolsOpen(false)}>
                  <Droplets size={15} color="var(--muted)" /> <span style={{ fontWeight: 600 }}>Giá Xăng</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--soft)', border: '1px solid var(--border)', borderRadius: 100, fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          <WeatherIcon size={13} strokeWidth={2.5} />
          <span>{infoLine || 'Đang tải...'}</span>
        </div>

      </div>
    </header>
  );
}
