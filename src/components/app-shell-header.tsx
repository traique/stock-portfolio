'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Solar } from 'lunar-javascript';
import {
  Cloud, CloudFog, CloudLightning, CloudRain, CloudSun,
  Sun, Moon, LogOut, ChevronDown, Bot, Check,
} from 'lucide-react';
import { DEFAULT_MODEL, type AiModelMeta } from '@/lib/server/ai-models';

// ─── Types ────────────────────────────────────────────────

type ThemeMode = 'light' | 'dark';
type AiModelKey = string;

type Props = {
  email?: string;
  isLoggedIn: boolean;
  currentTab: 'home' | 'dashboard' | 'gold' | 'oil' | 'system-live' | 'backtest';
  onLogout?: () => void;
  onAuthOpen?: () => void;
};

// ─── Helpers ──────────────────────────────────────────────

function getDisplayName(email?: string) {
  if (!email) return '';
  return email.split('@')[0] || email;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function getWeatherIcon(code: number | null) {
  if (code === null)                                             return CloudSun;
  if (code === 0 || code === 1)                                 return Sun;
  if (code === 2)                                               return CloudSun;
  if (code === 3)                                               return Cloud;
  if (code === 45 || code === 48)                               return CloudFog;
  if ([51,53,55,61,63,65,80,81,82].includes(code))             return CloudRain;
  if ([95,96,99].includes(code))                                return CloudLightning;
  return CloudSun;
}

// ─── CSS-in-JS constants ──────────────────────────────────

const PILL_BASE: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  gap:            5,
  borderRadius:   999,
  padding:        '5px 12px',
  background:     'rgba(255,255,255,0.52)',
  borderTop:    '1px solid rgba(255,255,255,0.88)',
  borderLeft:   '1px solid rgba(255,255,255,0.88)',
  borderRight:  '1px solid rgba(255,255,255,0.18)',
  borderBottom: '1px solid rgba(255,255,255,0.18)',
  fontSize:       11,
  fontWeight:     800,
  letterSpacing:  '0.04em',
  color:          'var(--text)',
  whiteSpace:     'nowrap',
};

const ICON_BTN: React.CSSProperties = {
  width:           36,
  height:          36,
  borderRadius:    '50%',
  background:      'rgba(255,255,255,0.52)',
  borderTop:    '1px solid rgba(255,255,255,0.88)',
  borderLeft:   '1px solid rgba(255,255,255,0.88)',
  borderRight:  '1px solid rgba(255,255,255,0.18)',
  borderBottom: '1px solid rgba(255,255,255,0.18)',
  color:           'var(--text)',
  cursor:          'pointer',
  display:         'grid',
  placeItems:      'center',
  flexShrink:      0,
  transition:      'box-shadow 0.18s ease',
};

// ─── Component ────────────────────────────────────────────

export default function AppShellHeader({
  email, isLoggedIn, currentTab, onLogout, onAuthOpen,
}: Props) {
  const [theme, setTheme]               = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen]         = useState(false);
  const [toolsOpen, setToolsOpen]       = useState(false);
  const [aiModel, setAiModelState]      = useState<AiModelKey>(DEFAULT_MODEL);
  const [aiModels, setAiModels]         = useState<AiModelMeta[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [infoLine, setInfoLine]         = useState('');
  const [weatherCode, setWeatherCode]   = useState<number | null>(null);

  const menuRef  = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Theme + model từ localStorage
  useEffect(() => {
    const t = localStorage.getItem('lcta_theme') as ThemeMode | null;
    if (t) { setTheme(t); document.documentElement.dataset.theme = t; }
    const m = localStorage.getItem('lcta_ai_model');
    if (m) setAiModelState(m);
  }, []);

  // Click outside
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (menuRef.current  && !menuRef.current.contains(e.target as Node))  setMenuOpen(false);
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Weather + date
  useEffect(() => {
    const ctrl = new AbortController();
    async function load() {
      try {
        const now     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
        const solar   = `${weekday}, ${pad2(now.getDate())}/${pad2(now.getMonth()+1)}`;
        const lunar   = Solar.fromYmd(now.getFullYear(), now.getMonth()+1, now.getDate()).getLunar();
        const lunarTx = `${pad2(lunar.getDay())}/${pad2(lunar.getMonth())} ÂL`;

        const res  = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=10.7769&longitude=106.7009&current=temperature_2m,weather_code&timezone=Asia%2FHo_Chi_Minh',
          { signal: ctrl.signal, cache: 'no-store' },
        );
        const data = await res.json();
        const temp = Math.round(Number(data?.current?.temperature_2m ?? 28));
        const code = Number.isFinite(Number(data?.current?.weather_code))
          ? Number(data.current.weather_code) : null;
        setWeatherCode(code);
        setInfoLine(`${solar} · ${lunarTx} · ${temp}°C`);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        const now = new Date();
        setInfoLine(`${pad2(now.getDate())}/${pad2(now.getMonth()+1)} · 28°C`);
      }
    }
    load();
    return () => ctrl.abort();
  }, []);

  // Lazy-load model list khi mở menu
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
    } catch { /* giữ list rỗng */ }
    finally   { setModelsLoading(false); }
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

  const WeatherIcon = useMemo(() => getWeatherIcon(weatherCode), [weatherCode]);
  const isToolActive = useMemo(() => ['gold','oil','system-live','backtest'].includes(currentTab), [currentTab]);

  // Tab style
  const tabCls = (active: boolean): React.CSSProperties => ({
    padding:        '7px 14px',
    fontSize:       12,
    fontWeight:     800,
    letterSpacing:  '0.05em',
    textTransform:  'uppercase',
    color:          active ? 'var(--text)' : 'var(--muted)',
    background:     active ? 'rgba(255,255,255,0.82)' : 'transparent',
    borderRadius:   999,
    textDecoration: 'none',
    border:         active ? '1px solid rgba(255,255,255,0.95)' : '1px solid transparent',
    boxShadow:      active ? '0 2px 10px rgba(99,120,180,0.14)' : 'none',
    display:        'flex',
    alignItems:     'center',
    gap:            4,
    cursor:         'pointer',
    whiteSpace:     'nowrap',
    transition:     'all 0.18s ease',
  });

  // Dark mode overrides bị inline — dùng CSS class thay thế cho active tab
  const darkTabActive: React.CSSProperties = {
    background: 'rgba(255,255,255,0.12)',
    border:     '1px solid rgba(255,255,255,0.22)',
    boxShadow:  '0 0 16px rgba(255,255,255,0.05)',
  };
  void darkTabActive; // unused in runtime, handled by CSS vars

  return (
    <header style={{
      position:          'sticky',
      top:               8,
      zIndex:            1000,
      padding:           '10px 14px',
      background:        'var(--card)',
      backdropFilter:    'var(--glass-backdrop)',
      WebkitBackdropFilter: 'var(--glass-backdrop)',
      borderRadius:      24,
      borderTop:    '1px solid var(--glass-ring)',
      borderLeft:   '1px solid var(--glass-ring)',
      borderRight:  '1px solid var(--glass-ring-b)',
      borderBottom: '1px solid var(--glass-ring-b)',
      boxShadow:    'var(--glass-shadow)',
      display:      'flex',
      flexDirection: 'column',
      gap:          10,
    }}>

      {/* Specular glow */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit',
        background: 'var(--glass-glow)', pointerEvents: 'none',
      }} />

      {/* ── ROW 1: Logo · Tabs · Weather · Actions ── */}
      <div style={{
        position:       'relative',
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        flexWrap:       'wrap',
        justifyContent: 'space-between',
      }}>

        {/* Logo */}
        <Link href="/" style={{
          fontFamily:    'var(--font-brand)',
          fontSize:      22,
          letterSpacing: '0.25em',
          color:         'var(--text)',
          flexShrink:    0,
        }}>
          LCTA
        </Link>

        {/* Nav tabs — center */}
        <nav style={{ display: 'flex', gap: 2, flexWrap: 'nowrap', flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
          <Link href="/"          style={tabCls(currentTab === 'home')}>HOME</Link>
          <Link href="/dashboard" style={tabCls(currentTab === 'dashboard')}>DANH MỤC</Link>

          {/* Tools dropdown */}
          <div ref={toolsRef} style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setToolsOpen(v => !v); }}
              style={{ ...tabCls(isToolActive), cursor: 'pointer' }}
            >
              TIỆN ÍCH
              <ChevronDown size={12} style={{ transform: toolsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {toolsOpen && (
              <div style={{
                position:    'absolute',
                top:         'calc(100% + 8px)',
                left:        0,
                background:  'var(--card)',
                backdropFilter: 'var(--glass-backdrop)',
                WebkitBackdropFilter: 'var(--glass-backdrop)',
                borderTop:    '1px solid var(--glass-ring)',
                borderLeft:   '1px solid var(--glass-ring)',
                borderRight:  '1px solid var(--glass-ring-b)',
                borderBottom: '1px solid var(--glass-ring-b)',
                borderRadius: 18,
                padding:      8,
                display:      'flex',
                flexDirection:'column',
                gap:          2,
                minWidth:     150,
                boxShadow:    'var(--glass-shadow)',
                zIndex:       9999,
              }}>
                {[
                  { href: '/system-live', label: 'TOP BUY/SELL' },
                  { href: '/backtest',    label: 'BACKTEST'      },
                  { href: '/gold',        label: 'GIÁ VÀNG'      },
                  { href: '/oil',         label: 'GIÁ XĂNG'      },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setToolsOpen(false)}
                    style={{
                      padding:        '9px 12px',
                      fontSize:       11,
                      fontWeight:     800,
                      letterSpacing:  '0.05em',
                      textDecoration: 'none',
                      color:          'var(--text)',
                      borderRadius:   12,
                      background:     currentTab === item.href.slice(1) ? 'rgba(255,255,255,0.45)' : 'transparent',
                      transition:     'background 0.15s ease',
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right: weather + theme + account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Weather pill */}
          {infoLine && (
            <div style={{ ...PILL_BASE, gap: 5, color: 'var(--muted)', fontSize: 10 }}>
              <WeatherIcon size={12} strokeWidth={2.5} />
              <span>{infoLine}</span>
            </div>
          )}

          {/* Theme toggle */}
          <button onClick={toggleTheme} style={ICON_BTN} aria-label="Đổi giao diện">
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          {/* Account button */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            {isLoggedIn ? (
              <button
                onClick={e => { e.stopPropagation(); const opening = !menuOpen; setMenuOpen(opening); if (opening) fetchModels(); }}
                style={{ ...PILL_BASE, cursor: 'pointer', fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                {getDisplayName(email)}
              </button>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onAuthOpen?.(); }}
                style={{ ...PILL_BASE, cursor: 'pointer', fontSize: 10, fontWeight: 900, letterSpacing: '0.06em' }}
              >
                SIGN IN
              </button>
            )}

            {/* Account dropdown */}
            {menuOpen && isLoggedIn && (
              <div style={{
                position:       'absolute',
                top:            'calc(100% + 8px)',
                right:          0,
                background:     'var(--card)',
                backdropFilter: 'var(--glass-backdrop)',
                WebkitBackdropFilter: 'var(--glass-backdrop)',
                borderTop:    '1px solid var(--glass-ring)',
                borderLeft:   '1px solid var(--glass-ring)',
                borderRight:  '1px solid var(--glass-ring-b)',
                borderBottom: '1px solid var(--glass-ring-b)',
                borderRadius: 22,
                padding:      14,
                width:        260,
                boxShadow:    'var(--glass-shadow)',
                zIndex:       9999,
              }}>

                {/* Specular */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'var(--glass-glow)', pointerEvents: 'none' }} />

                <div style={{ position: 'relative' }}>
                  {/* User info */}
                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{getDisplayName(email)}</div>
                  <div style={{
                    fontSize: 10, color: 'var(--muted)', marginTop: 2,
                    paddingBottom: 12, marginBottom: 12,
                    borderBottom: '1px solid var(--border)',
                    wordBreak: 'break-all',
                  }}>
                    {email}
                  </div>

                  {/* AI Model */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 9, fontWeight: 900, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    marginBottom: 8,
                  }}>
                    <Bot size={11} /> AI MODEL
                  </div>

                  {/* Scrollable model list */}
                  <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {modelsLoading ? (
                      [1,2,3].map(i => (
                        <div key={i} style={{ height: 46, borderRadius: 10, background: 'var(--soft)', opacity: 0.6, marginBottom: 2 }} />
                      ))
                    ) : (
                      (['gemini','groq'] as const).map(provider => {
                        const group = aiModels.filter(m => m.provider === provider);
                        if (!group.length) return null;
                        return (
                          <div key={provider}>
                            <div style={{
                              fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                              letterSpacing: '0.07em', color: 'var(--muted)',
                              padding: '8px 4px 4px',
                              borderTop: provider === 'groq' ? '1px solid var(--border)' : 'none',
                              marginTop: provider === 'groq' ? 6 : 0,
                            }}>
                              {provider === 'gemini' ? '🔵 Google Gemini' : '🟢 Groq'}
                            </div>
                            {group.map(m => {
                              const active = aiModel === m.key;
                              return (
                                <button
                                  key={m.key}
                                  type="button"
                                  onClick={() => selectModel(m.key)}
                                  style={{
                                    width:       '100%',
                                    display:     'flex',
                                    alignItems:  'center',
                                    justifyContent: 'space-between',
                                    gap:         8,
                                    padding:     '7px 9px',
                                    borderRadius: 10,
                                    border:       active ? '1px solid rgba(59,130,246,0.38)' : '1px solid transparent',
                                    background:   active ? 'rgba(59,130,246,0.10)' : 'transparent',
                                    cursor:       'pointer',
                                    textAlign:    'left',
                                    transition:   'all 0.15s',
                                  }}
                                >
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: 'var(--text)' }}>
                                      {m.label}
                                      <span style={{
                                        fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99,
                                        background: provider === 'gemini' ? 'rgba(59,130,246,0.13)' : 'rgba(16,185,129,0.13)',
                                        color:      provider === 'gemini' ? '#3b82f6' : '#10b981',
                                      }}>
                                        {m.badge}
                                      </span>
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
                    )}
                    {!modelsLoading && aiModels.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 4px' }}>
                        Không tải được danh sách model
                      </div>
                    )}
                  </div>

                  {/* Logout */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 12 }}>
                    <button
                      onClick={onLogout}
                      style={{
                        display:     'flex',
                        alignItems:  'center',
                        gap:         7,
                        color:       'var(--red)',
                        background:  'rgba(244,63,94,0.08)',
                        border:      '1px solid rgba(244,63,94,0.20)',
                        width:       '100%',
                        padding:     '8px 12px',
                        borderRadius: 12,
                        cursor:      'pointer',
                        fontSize:    11,
                        fontWeight:  800,
                        letterSpacing: '0.04em',
                      }}
                    >
                      <LogOut size={13} /> ĐĂNG XUẤT
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
