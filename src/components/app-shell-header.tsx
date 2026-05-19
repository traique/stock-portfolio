'use client';

import React, { useEffect, useState } from 'react';

import {
  ChevronDown,
  Moon,
  Sun,
  LayoutGrid,
} from 'lucide-react';

type Props = {
  title?: string;
};

export function AppShellHeader({
  title = 'Portfolio',
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
          padding:
            '10px 16px 14px',
          display: 'grid',
          gap: 12,
        }}
      >
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

        <div
          style={{
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            className='glass-card'
            style={{
              flex: 1,
              height: 46,
              borderRadius: 18,
              border:
                '1px solid var(--border)',
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
          </button>

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
                {[
                  'Thống kê',
                  'Lịch sử',
                  'Danh mục',
                  'Cài đặt',
                ].map((item) => (
                  <button
                    key={item}
                    style={{
                      height: 42,
                      borderRadius: 14,
                      border:
                        '1px solid transparent',
                      background:
                        'transparent',
                      color:
                        'var(--text)',
                      textAlign:
                        'left',
                      padding:
                        '0 12px',
                      fontWeight: 600,
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
                        }
