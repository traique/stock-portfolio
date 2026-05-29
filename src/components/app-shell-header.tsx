'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSun,
  Sun, Moon, LogOut, ChevronDown, Bot, Check,
} from 'lucide-react';
import { DEFAULT_MODEL, type AiModelMeta } from '@/lib/server/ai-models';

type ThemeMode = 'light' | 'dark';
type AiModelKey = string;

type Props = {
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

function getDisplayName(email?: string) {
  if (!email) return '';
  return (email.split('@')[0] || email).toUpperCase();
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
function getWeatherIcon(code: number | null) {
  if (code === null)                                   return CloudSun;
  if (code <= 1)                                       return Sun;
  if (code === 2)                                      return CloudSun;
  if (code === 3)                                      return Cloud;
  if (code === 45 || code === 48)                      return CloudFog;
  if ([51,53,55,61,63,65,80,81,82].includes(code))    return CloudRain;
  if ([95,96,99].includes(code))                       return CloudLightning;
  return CloudSun;
}

/* ── CSS classes are defined in globals.css (ab-glass-pill, ab-icon-btn, ab-account-btn, ab-dropdown) ── */

export default function AppShellHeader({
  email, isLoggedIn, currentTab, onLogout, onAuthOpen,
}: Props) {
  const [theme, setTheme]                 = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen]           = useState(false);
  const [toolsOpen, setToolsOpen]         = useState(false);
  const [aiModel, setAiModelState]        = useState<AiModelKey>(DEFAULT_MODEL);
  const [aiModels, setAiModels]           = useState<AiModelMeta[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [infoLine, setInfoLine]           = useState('');
  const [weatherCode, setWeatherCode]     = useState<number | null>(null);

  const menuRef  = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  /* Restore theme + model */
  useEffect(() => {
    const t = localStorage.getItem('lcta_theme') as ThemeMode | null;
    if (t) { setTheme(t); document.documentElement.dataset.theme = t; }
    const m = localStorage.getItem('lcta_ai_model');
    if (m) setAiModelState(m);
  }, []);

  /* Click outside */
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (menuRef.current  && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  /* Weather + date */
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const now     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solar   = `${weekday} ${pad2(now.getDate())}/${pad2(now.getMonth()+1)}`;
        const lunar   = Solar.fromYmd(now.getFullYear(), now.getMonth()+1, now.getDate()).getLunar();
        const lunarTx = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL`;
        const res     = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=10.7769&longitude=106.7009&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh',
          { signal: ctrl.signal, cache: 'no-store' },
        );
        const data  = await res.json();
        const temp  = Math.round(Number(data?.current?.temperature_2m ?? 28));
        const code  = Number.isFinite(Number(data?.current?.weather_code)) ? Number(data.current.weather_code) : null;
        setWeatherCode(code);
        setInfoLine(`${solar} · ${lunarTx} · ${temp}°C`);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        const n = new Date();
        setInfoLine(`${pad2(n.getDate())}/${pad2(n.getMonth()+1)} · 28°C`);
      }
    })();
    return () => ctrl.abort();
  }, []);

  /* Lazy load models */
  const fetchModels = async () => {
    if (aiModels.length > 0 || modelsLoading) return;
    setModelsLoading(true);
    try {
      const res = await fetch('/api/ai/models');
      if (res.ok) {
        const data = await res.json();
        const list: AiModelMeta[] = data.models ?? [];
        setAiModels(list);
        const saved = localStorage.getItem('lcta_ai_model');
        if (saved && !list.some(m => m.key === saved)) {
          setAiModelState(DEFAULT_MODEL);
          localStorage.setItem('lcta_ai_model', DEFAULT_MODEL);
        }
      }
    } finally { setModelsLoading(false); }
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('lcta_theme', next);
  };

  const selectModel = (key: AiModelKey) => {
    setAiModelState(key);
    localStorage.setItem('lcta_ai_model', key);
    window.dispatchEvent(new CustomEvent('lcta:ai-model-change', { detail: { model: key } }));
    setMenuOpen(false);
  };

  const WeatherIcon  = useMemo(() => getWeatherIcon(weatherCode), [weatherCode]);
  const isToolActive = useMemo(() => ['gold','oil','system-live','backtest'].includes(currentTab), [currentTab]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
    color:       active ? 'var(--text)'               : 'var(--muted)',
    background:  active ? 'rgba(255,255,255,0.28)'    : 'transparent',
    border:      active ? '1px solid rgba(255,255,255,0.55)' : '1px solid transparent',
    boxShadow:   active ? '0 2px 10px rgba(0,0,0,0.10)' : 'none',
    borderRadius: 999, textDecoration: 'none',
    display: 'flex', alignItems: 'center', gap: 4,
    cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'all 0.18s ease',
  });

  const HEADER: React.CSSProperties = {
    position: 'sticky', top: 8, zIndex: 1000,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.32)',
    borderRadius: 24,
    boxShadow: '0 4px 28px rgba(0,0,0,0.14)',
    display: 'flex', flexDirection: 'column', gap: 8,
  };

  return (
    <header style={HEADER}>
      {/* Specular glow */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, transparent 50%)',
      }} />

      {/* ── ROW 1: Info · Theme · Account ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>

        {/* Weather + date pill — contrast cao cả dark lẫn light */}
        <div className="ab-glass-pill">
          <WeatherIcon size={12} strokeWidth={2.5} />
          <span style={{ color: 'var(--text)', opacity: 0.85 }}>{infoLine || '...'}</span>
        </div>

        {/* Theme + Account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={toggleTheme} className="ab-icon-btn" aria-label="Đổi giao diện">
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            {isLoggedIn ? (
              <button
                onClick={e => {
                  e.stopPropagation();
                  const opening = !menuOpen;
                  setMenuOpen(opening);
                  if (opening) fetchModels();
                }}
                className="ab-account-btn"
              >
                {getDisplayName(email)}
              </button>
            ) : (
              <button onClick={e => { e.stopPropagation(); onAuthOpen?.(); }} className="ab-account-btn">
                SIGN IN
              </button>
            )}

            {/* Account dropdown */}
            {menuOpen && isLoggedIn && (
              <div className="ab-dropdown" style={{ right: 0, width: 262 }}>
                <div style={{ padding: '2px 4px 12px', borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{getDisplayName(email)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, wordBreak: 'break-all' }}>{email}</div>
                </div>

                {/* AI model label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, padding: '0 4px' }}>
                  <Bot size={11} /> AI MODEL
                </div>

                {/* Scrollable model list */}
                <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {modelsLoading
                    ? [1,2,3].map(i => <div key={i} style={{ height: 44, borderRadius: 10, background: 'var(--soft)', opacity: 0.5 }} />)
                    : (['gemini','groq'] as const).map(provider => {
                        const group = aiModels.filter(m => m.provider === provider);
                        if (!group.length) return null;
                        return (
                          <div key={provider}>
                            <div style={{
                              fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em',
                              color: 'var(--muted)', padding: '8px 4px 4px',
                              borderTop: provider === 'groq' ? '1px solid var(--border)' : 'none',
                              marginTop: provider === 'groq' ? 6 : 0,
                            }}>
                              {provider === 'gemini' ? '🔵 Google Gemini' : '🟢 Groq'}
                            </div>
                            {group.map(m => {
                              const active = aiModel === m.key;
                              return (
                                <button key={m.key} type="button" onClick={() => selectModel(m.key)} style={{
                                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  gap: 8, padding: '7px 9px', borderRadius: 10,
                                  border: active ? '1px solid rgba(59,130,246,0.38)' : '1px solid transparent',
                                  background: active ? 'rgba(59,130,246,0.10)' : 'transparent',
                                  cursor: 'pointer', textAlign: 'left',
                                }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: 'var(--text)' }}>
                                      {m.label}
                                      <span style={{
                                        fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99,
                                        background: provider === 'gemini' ? 'rgba(59,130,246,0.13)' : 'rgba(16,185,129,0.13)',
                                        color: provider === 'gemini' ? '#3b82f6' : '#10b981',
                                      }}>{m.badge}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{m.desc}</div>
                                  </div>
                                  {active && <Check size={13} color="#3b82f6" style={{ flexShrink: 0 }} />}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })
                  }
                  {!modelsLoading && aiModels.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 4px' }}>Không tải được danh sách model</div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12 }}>
                  <button onClick={onLogout} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    color: 'var(--red)', background: 'rgba(244,63,94,0.08)',
                    border: '1px solid rgba(244,63,94,0.20)',
                    width: '100%', padding: '8px 12px', borderRadius: 12,
                    cursor: 'pointer', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                  }}>
                    <LogOut size={13} /> ĐĂNG XUẤT
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 2: Logo · Nav · Dropdown ── */}
      {/* overflow: visible để dropdown không bị clip */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>

        {/* Logo */}
        <Link href="/" style={{
          fontFamily: 'var(--font-brand)', fontSize: 21, letterSpacing: '0.22em',
          color: 'var(--text)', flexShrink: 0, marginRight: 4,
        }}>
          LCTA
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Link href="/"          style={tabStyle(currentTab === 'home')}>HOME</Link>
          <Link href="/dashboard" style={tabStyle(currentTab === 'dashboard')}>DANH MỤC</Link>

          {/* Tools — overflow visible, KHÔNG bọc bằng container có overflow:hidden */}
          <div ref={toolsRef} style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setToolsOpen(v => !v); }}
              style={{ ...tabStyle(isToolActive), background: 'none', border: 'none', padding: '7px 2px' }}
            >
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 12px', borderRadius: 999,
                color:       isToolActive ? 'var(--text)'  : 'var(--muted)',
                background:  isToolActive ? 'rgba(255,255,255,0.28)' : 'transparent',
                border:      isToolActive ? '1px solid rgba(255,255,255,0.55)' : '1px solid transparent',
                fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                TIỆN ÍCH
                <ChevronDown size={12} style={{ transform: toolsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
              </span>
            </button>

            {toolsOpen && (
              <div className="ab-dropdown" style={{ left: 0, minWidth: 156 }}>
                {[
                  { href: '/system-live', label: '📊 TOP BUY/SELL' },
                  { href: '/backtest',    label: '🔬 BACKTEST'      },
                  { href: '/gold',        label: '🪙 GIÁ VÀNG'      },
                  { href: '/oil',         label: '⛽ GIÁ XĂNG'      },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setToolsOpen(false)}
                    style={{
                      display: 'block', padding: '10px 12px',
                      fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                      textDecoration: 'none', color: 'var(--text)', borderRadius: 13,
                      background: currentTab === item.href.slice(1) ? 'rgba(255,255,255,0.22)' : 'transparent',
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
