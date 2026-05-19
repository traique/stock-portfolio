'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSun,
  Sun, Moon, LogOut, ChevronDown, Check,
} from 'lucide-react';
import { AI_MODELS, type AiModelKey, DEFAULT_MODEL } from '@/lib/server/ai-models';

const AI_MODEL_KEY = 'lcta_ai_model';
type ThemeMode = 'light' | 'dark';

type Props = {
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

const getDisplayName = (email?: string) => email?.split('@')[0] || '';
const pad2 = (n: number) => String(n).padStart(2, '0');

function getWeatherIcon(code: number | null) {
  if (code === null) return CloudSun;
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if ([51,53,55,61,63,65,80,81,82].includes(code)) return CloudRain;
  if ([95,96,99].includes(code)) return CloudLightning;
  return CloudSun;
}

export default function AppShellHeader({ email, isLoggedIn, currentTab, onLogout, onAuthOpen }: Props) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [infoLine, setInfoLine] = useState('');
  const [aiModel, setAiModelState] = useState<AiModelKey>(DEFAULT_MODEL);

  const menuRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lcta_theme') as ThemeMode | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function buildInfo() {
      const now = new Date();
      const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(now);
      const lunar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()).getLunar();

      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=10.7769&longitude=106.7009&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh');
        const data = await res.json();
        setWeatherCode(Number(data?.current?.weather_code ?? 0));
        setInfoLine(`${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth()+1)} · ${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL · TP.HCM ${Math.round(Number(data?.current?.temperature_2m ?? 29))}°C`);
      } catch {
        setInfoLine(`${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth()+1)} · TP.HCM 29°C`);
      }
    }

    buildInfo();
  }, []);

  const WeatherIcon = useMemo(() => getWeatherIcon(weatherCode), [weatherCode]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    textDecoration: 'none',
    color: 'var(--text)',
    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
    border: active ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
  });

  return (
    <header style={{
      position: 'sticky',
      top: 8,
      zIndex: 1000,
      padding: 12,
      borderRadius: 24,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05))',
      backdropFilter: 'blur(30px) saturate(180%)',
      WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      display: 'grid',
      gap: 10,
      overflow: 'visible',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href='/' style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 18, letterSpacing: '0.18em' }}>
          LCTA
        </Link>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={toggleTheme} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--soft)' }}>
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => isLoggedIn ? setMenuOpen(v => !v) : onAuthOpen?.()} style={{ height: 32, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--soft)', fontSize: 10, fontWeight: 800 }}>
              {isLoggedIn ? getDisplayName(email) : 'SIGN IN'}
            </button>

            {menuOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 240, background: 'rgba(15,23,42,0.92)', borderRadius: 18, padding: 12, zIndex: 2000 }}>
                {AI_MODELS.map(m => (
                  <button key={m.key} onClick={() => { setAiModelState(m.key); localStorage.setItem(AI_MODEL_KEY, m.key); }} style={{ width: '100%', marginBottom: 6, padding: 10, borderRadius: 12, border: 'none', background: aiModel === m.key ? 'rgba(59,130,246,0.20)' : 'rgba(255,255,255,0.06)', color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.label}</span>
                    {aiModel === m.key && <Check size={12} />}
                  </button>
                ))}

                <button onClick={onLogout} style={{ width: '100%', padding: 10, borderRadius: 12, border: 'none', background: 'rgba(244,63,94,0.14)', color: '#fb7185' }}>
                  <LogOut size={12} /> ĐĂNG XUẤT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className='num-premium' style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 34, borderRadius: 999, background: 'rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 800 }}>
        <WeatherIcon size={14} />
        <span>{infoLine}</span>
      </div>

      <nav style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <Link href='/' style={tabStyle(currentTab === 'home')}>HOME</Link>
        <Link href='/dashboard' style={tabStyle(currentTab === 'dashboard')}>DANH MỤC</Link>

        <div ref={toolsRef} style={{ position: 'relative' }}>
          <button onClick={() => setToolsOpen(v => !v)} style={tabStyle(['gold','oil','system-live','backtest'].includes(currentTab))}>
            TIỆN ÍCH <ChevronDown size={12} style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>

          {toolsOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: 180, background: 'rgba(15,23,42,0.96)', borderRadius: 16, padding: 8, zIndex: 3000, display: 'grid', gap: 4 }}>
              <Link href='/system-live' style={{ padding: 10, borderRadius: 12, textDecoration: 'none', color: 'white' }}>TOP BUY/SELL</Link>
              <Link href='/backtest' style={{ padding: 10, borderRadius: 12, textDecoration: 'none', color: 'white' }}>BACKTEST</Link>
              <Link href='/gold' style={{ padding: 10, borderRadius: 12, textDecoration: 'none', color: 'white' }}>GIÁ VÀNG</Link>
              <Link href='/oil' style={{ padding: 10, borderRadius: 12, textDecoration: 'none', color: 'white' }}>GIÁ XĂNG</Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
