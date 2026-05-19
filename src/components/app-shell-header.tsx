'use client';

import React, {
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

import {
  ChevronDown,
  LayoutGrid,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';

type Props = {
  title?: string;

  isLoggedIn?: boolean;

  currentTab?: string;

  email?: string;

  onLogout?: () => void;
};

export default function AppShellHeader({
  title = 'Portfolio',
  isLoggedIn = false,
  currentTab = 'home',
  email,
  onLogout,
}: Props) {
  const [theme, setTheme] =
    useState<'dark' | 'light'>(
      'dark'
    );

  const [open, setOpen] =
    useState(false);

  useEffect(() => {
    const saved =
      localStorage.getItem(
        'theme'
      ) || 'dark';

    setTheme(
      saved as 'dark' | 'light'
    );

    document.documentElement.classList.toggle(
      'light',
      saved === 'light'
    );
  }, []);

  const toggleTheme = () => {
    const next =
      theme === 'dark'
        ? 'light'
        : 'dark';

    setTheme(next);

    localStorage.setItem(
      'theme',
      next
    );

    document.documentElement.classList.toggle(
      'light',
      next === 'light'
    );
  };

  return (
    <header className='header-glass'>
      <div
        style={{
          width: '100%',
          maxWidth: 1680,
          margin: '0 auto',
          padding:
            '10px 16px 14px',
          display: 'grid',
          gap: 12,
        }}
      >
        {/* top */}

        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing:
                  '0.08em',
                color:
                  'var(--muted)',
              }}
            >
              STOCK PORTFOLIO
            </div>

            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginTop: 4,
              }}
            >
              {title}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {email && (
              <div
                style={{
                  display: 'none',
                  fontSize: 12,
                  color:
                    'var(--muted)',
                }}
                className='desktop-email'
              >
                {email}
              </div>
            )}

            <button
              onClick={toggleTheme}
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                border:
                  '1px solid var(--border)',
                background:
                  'var(--soft)',
                display: 'grid',
                placeItems: 'center',
                color:
                  'var(--text)',
              }}
            >
              {theme === 'dark' ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
          </div>
        </div>

        {/* weather */}

        <div
          className='glass-card'
          style={{
            padding:
              '10px 14px',
            borderRadius: 18,
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color:
                  'var(--muted)',
                fontWeight: 700,
              }}
            >
              WEATHER
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              29°C · Hồ Chí Minh
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color:
                'var(--muted)',
            }}
          >
            Clear Sky
          </div>
        </div>

        {/* nav */}

        <div
          style={{
            display: 'flex',
            gap: 10,
          }}
        >
          <Link
            href='/dashboard'
            className='glass-card'
            style={{
              flex: 1,
              height: 46,
              borderRadius: 18,
              border:
                currentTab ===
                'dashboard'
                  ? '1px solid rgba(59,130,246,0.45)'
                  : '1px solid var(--border)',

              color:
                'var(--text)',

              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'center',

              gap: 8,

              fontWeight: 700,
            }}
          >
            <LayoutGrid size={16} />

            Home
          </Link>

          <div
            style={{
              position:
                'relative',
            }}
          >
            <button
              onClick={() =>
                setOpen(!open)
              }
              className='glass-card'
              style={{
                height: 46,
                padding:
                  '0 14px',
                borderRadius: 18,
                border:
                  '1px solid var(--border)',
                color:
                  'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
              }}
            >
              Tiện ích

              <ChevronDown
                size={16}
              />
            </button>

            {open && (
              <div
                className='glass-card'
                style={{
                  position:
                    'absolute',

                  top: 54,

                  right: 0,

                  width: 220,

                  padding: 10,

                  borderRadius: 18,

                  display: 'grid',

                  gap: 8,

                  zIndex: 100,
                }}
              >
                <Link
                  href='/backtest'
                  style={{
                    height: 42,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    padding:
                      '0 12px',
                    fontWeight: 600,
                  }}
                >
                  Backtest
                </Link>

                <Link
                  href='/gold-live'
                  style={{
                    height: 42,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    padding:
                      '0 12px',
                    fontWeight: 600,
                  }}
                >
                  Gold Live
                </Link>

                <Link
                  href='/oil-live'
                  style={{
                    height: 42,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    padding:
                      '0 12px',
                    fontWeight: 600,
                  }}
                >
                  Oil Live
                </Link>

                <Link
                  href='/system-live'
                  style={{
                    height: 42,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    padding:
                      '0 12px',
                    fontWeight: 600,
                  }}
                >
                  System Live
                </Link>

                {isLoggedIn &&
                  onLogout && (
                    <button
                      onClick={
                        onLogout
                      }
                      style={{
                        height: 42,
                        borderRadius: 14,
                        border:
                          'none',
                        background:
                          'transparent',
                        color:
                          'var(--red)',
                        display:
                          'flex',
                        alignItems:
                          'center',
                        gap: 8,
                        padding:
                          '0 12px',
                        fontWeight: 700,
                      }}
                    >
                      <LogOut
                        size={16}
                      />

                      Đăng xuất
                    </button>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
