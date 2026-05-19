'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSun,
  Sun, Moon, LogOut, ChevronDown, Bot, Check,
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

function getDisplayName(email?: string): string {
  if (!email) return '';
  return email.split('@')[0] || email;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getWeatherIcon(code: number | null) {
  if (code === null) return CloudSun;
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return CloudRain;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return CloudSun;
}

export default function AppShellHeader({
  email,
  isLoggedIn,
  currentTab,
  onLogout,
  onAuthOpen,
}: Props) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiModel, setAiModelState] = useState<AiModelKey>(DEFAULT_MODEL);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [infoLine, setInfoLine] = useState('');
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lcta_theme') as ThemeMode | null;

    if (saved) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }

    const savedModel = localStorage.getItem(AI_MODEL_KEY) as AiModelKey | null;

    if (savedModel && AI_MODELS.some(m => m.key === savedModel)) {
      setAiModelState(savedModel);
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';

    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }

      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function buildInfo() {
      try {
        const now = new Date(new Date().toLocaleString('en-US', {
          timeZone: 'Asia/Ho_Chi_Minh',
        }));

        const weekday = new Intl.DateTimeFormat('vi-VN', {
          weekday: 'short',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(now);

        const solarText = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}`;

        const lunar = Solar
          .fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate())
          .getLunar();

        const lunarText = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL`;

        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=10.7769&longitude=106.7009&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh',
          {
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        const data = await res.json();

        const temp = Math.round(Number(data?.current?.temperature_2m ?? 24));

        const code = Number.isFinite(Number(data?.current?.weather_code))
          ? Number(data.current.weather_code)
          : null;

        setWeatherCode(code);
        setInfoLine(`${solarText} · ${lunarText} · TP.HCM ${temp}°C`);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const now = new Date();
        setInfoLine(`${pad2(now.getDate())}/${pad2(now.getMonth() + 1)} · TP.HCM 28°C`);
      }
    }

    buildInfo();

    return () => controller.abort();
  }, []);

  const WeatherIcon = useMemo(() => getWeatherIcon(weatherCode), [weatherCode]);

  const isToolActive = useMemo(
    () => ['gold', 'oil', 'system-live', 'backtest'].includes(currentTab),
    [currentTab],
  );

  const tabStyle = useMemo(
    () => (active: boolean): React.CSSProperties => ({
      padding: isMobile ? '8px 12px' : '8px 16px',
      fontSize: isMobile ? 11 : 12,
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: active ? 'var(--text)' : 'var(--muted)',
      background: active
        ? 'rgba(255,255,255,0.12)'
        : 'transparent',
      borderRadius: 999,
      textDecoration: 'none',
      transition: 'all 0.2s ease',
      border: active
        ? '1px solid rgba(255,255,255,0.16)'
        : '1px solid transparent',
      backdropFilter: active ? 'blur(20px)' : 'none',
      WebkitBackdropFilter: active ? 'blur(20px)' : 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }),
    [isMobile],
  );

  const selectModel = (key: AiModelKey) => {
    setAiModelState(key);
    localStorage.setItem(AI_MODEL_KEY, key);

    window.dispatchEvent(
      new CustomEvent('lcta:ai-model-change', {
        detail: { model: key },
      }),
    );
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: isMobile ? 8 : 12,
        zIndex: 1000,
        padding: isMobile ? '12px' : '14px 18px',
        borderRadius: isMobile ? 22 : 28,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        boxShadow: '0 12px 40px rgba(15,23,42,0.16)',
        display: 'grid',
        gap: 14,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(255,255,255,0.02), rgba(59,130,246,0.08))',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: 'none',
            fontFamily: 'var(--font-brand)',
            fontSize: isMobile ? 20 : 24,
            letterSpacing: '0.22em',
            color: 'var(--text)',
          }}
        >
          LCTA
        </Link>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={toggleTheme}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              backdropFilter: 'blur(20px)',
            }}
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                isLoggedIn ? setMenuOpen(v => !v) : onAuthOpen?.();
              }}
              style={{
                height: 34,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.08)',
                padding: isMobile ? '0 10px' : '0 14px',
                fontSize: 10,
                fontWeight: 800,
                color: 'var(--text)',
                cursor: 'pointer',
                backdropFilter: 'blur(20px)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                maxWidth: isMobile ? 100 : 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isLoggedIn ? getDisplayName(email) : 'SIGN IN'}
            </button>

            {menuOpen && isLoggedIn && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: isMobile ? 280 : 320,
                  maxWidth: 'calc(100vw - 24px)',
                  background: 'rgba(15,23,42,0.72)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 22,
                  padding: 14,
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  boxShadow: '0 20px 60px rgba(15,23,42,0.28)',
                }}
              >
                <div style={{ fontWeight: 800, color: 'white', fontSize: 13 }}>
                  {getDisplayName(email)}
                </div>

                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', marginTop: 4, marginBottom: 14, wordBreak: 'break-all' }}>
                  {email}
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  {AI_MODELS.map(m => {
                    const active = aiModel === m.key;

                    return (
                      <button
                        key={m.key}
                        onClick={() => selectModel(m.key)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 16,
                          border: active
                            ? '1px solid rgba(59,130,246,0.40)'
                            : '1px solid transparent',
                          background: active
                            ? 'rgba(59,130,246,0.16)'
                            : 'rgba(255,255,255,0.04)',
                          color: 'white',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>{m.label}</div>
                          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{m.desc}</div>
                        </div>

                        {active && <Check size={14} color="#60a5fa" />}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={onLogout}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    height: 40,
                    borderRadius: 16,
                    border: '1px solid rgba(244,63,94,0.18)',
                    background: 'rgba(244,63,94,0.12)',
                    color: '#fb7185',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <LogOut size={14} /> ĐĂNG XUẤT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 12,
        }}
      >
        <nav
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: 2,
          }}
        >
          <Link href="/" style={tabStyle(currentTab === 'home')}>
            HOME
          </Link>

          <Link href="/dashboard" style={tabStyle(currentTab === 'dashboard')}>
            DANH MỤC
          </Link>

          <div ref={toolsRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToolsOpen(v => !v);
              }}
              style={tabStyle(isToolActive)}
            >
              TIỆN ÍCH
              <ChevronDown
                size={14}
                style={{
                  transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </button>

            {toolsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  left: 0,
                  minWidth: 180,
                  background: 'rgba(15,23,42,0.78)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 18,
                  padding: 8,
                  display: 'grid',
                  gap: 4,
                  backdropFilter: 'blur(40px)',
                }}
              >
                {[
                  ['/system-live', 'TOP BUY/SELL'],
                  ['/backtest', 'BACKTEST'],
                  ['/gold', 'GIÁ VÀNG'],
                  ['/oil', 'GIÁ XĂNG'],
                ].map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setToolsOpen(false)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div
          className="num-premium"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isMobile ? 'center' : 'flex-start',
            gap: 8,
            minHeight: 38,
            padding: '0 14px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
            color: 'var(--muted)',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          <WeatherIcon size={14} color="var(--text)" />
          <span>{infoLine || 'ĐANG TẢI...'}</span>
        </div>
      </div>
    </header>
  );
}
