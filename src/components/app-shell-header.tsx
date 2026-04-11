'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gem,
  House,
  LineChart,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';

type ThemeMode = 'light' | 'dark';

type Props = {
  title: string;
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

export default function AppShellHeader({ title, email, isLoggedIn, currentTab, onLogout, onAuthOpen }: Props) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoLine, setInfoLine] = useState('');
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('alphaboard_theme') as ThemeMode | null;
    const nextTheme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function buildInfo() {
      try {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solarText = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
        const lunar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()).getLunar();
        const lunarText = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())}/${now.getFullYear()} ÂL`;

        let lat = 10.7769;
        let lon = 106.7009;

        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000, maximumAge: 15 * 60 * 1000 });
          });
          lat = position.coords.latitude;
          lon = position.coords.longitude;
        } catch {}

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh`, { cache: 'no-store' });
        const data = await response.json();
        const temp = Math.round(Number(data?.current?.temperature_2m ?? 24));
        const code = Number.isFinite(Number(data?.current?.weather_code)) ? Number(data.current.weather_code) : null;
        setWeatherCode(code);
        setInfoLine(`${solarText} · ${lunarText} · ${temp}°C`);
      } catch {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solarText = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
        const lunar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate()).getLunar();
        const lunarText = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())}/${now.getFullYear()} ÂL`;
        setInfoLine(`${solarText} · ${lunarText}`);
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

  return (
    <section className="ab-hero-premium">
      <div className="ab-hero-topline">
        <div className="ab-brand-mark">LCTA</div>

        <div className="ab-hero-actions">
          <button type="button" className="ab-icon-glass" onClick={toggleTheme} aria-label="Đổi giao diện">
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>

          <div className="ab-account-wrap" ref={menuRef}>
            {isLoggedIn ? (
              <button type="button" className="ab-account-glass" onClick={() => setMenuOpen((prev) => !prev)}>
                <span>{getDisplayName(email)}</span>
              </button>
            ) : (
              <button type="button" className="ab-account-glass" onClick={onAuthOpen}>
                <span>Đăng nhập</span>
                <ArrowRight size={14} />
              </button>
            )}

            {menuOpen && isLoggedIn ? (
              <div className="ab-account-menu premium">
                <div className="ab-account-name">{getDisplayName(email)}</div>
                <div className="ab-account-email">{email}</div>
                <button type="button" className="ab-menu-btn danger" onClick={onLogout}>
                  <LogOut size={16} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ab-hero-main">
        <div className="ab-hero-copy">
          <h1 className="ab-hero-title">{title}</h1>
          <div className="ab-hero-subline">
            <WeatherIcon size={15} strokeWidth={2} />
            <span>{infoLine || 'Đang tải...'}</span>
          </div>
        </div>

        <div className="ab-premium-tabs">
          <Link href="/" className={`ab-premium-tab ${currentTab === 'home' ? 'active' : ''}`}><House size={15} /><span>Home</span></Link>
          <Link href="/dashboard" className={`ab-premium-tab ${currentTab === 'dashboard' ? 'active' : ''}`}><BriefcaseBusiness size={15} /><span>Danh mục</span></Link>
          <Link href="/system-live" className={`ab-premium-tab ${currentTab === 'system-live' ? 'active' : ''}`}><Activity size={15} /><span>Hệ thống Live</span></Link>
          <Link href="/backtest" className={`ab-premium-tab ${currentTab === 'backtest' ? 'active' : ''}`}><LineChart size={15} /><span>Backtest</span></Link>
          <Link href="/gold" className={`ab-premium-tab ${currentTab === 'gold' ? 'active' : ''}`}><Gem size={15} /><span>Giá vàng</span></Link>
          <Link href="/oil" className={`ab-premium-tab ${currentTab === 'oil' ? 'active' : ''}`}><Droplets size={15} /><span>Giá xăng</span></Link>
        </div>
      </div>
    </section>
  );
}
