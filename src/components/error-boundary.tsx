'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children:    ReactNode;
  /** Optional custom fallback. Defaults to a minimal inline error card. */
  fallback?:   ReactNode;
  /** Label shown in the default fallback, e.g. "Danh mục" or "AI Scan" */
  sectionName?: string;
}

interface State {
  hasError: boolean;
  message:  string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const section = this.props.sectionName ?? 'Mục này';
      return (
        <div
          style={{
            borderRadius: 16,
            padding: '20px 24px',
            background: 'rgba(244,63,94,0.06)',
            border: '1px solid rgba(244,63,94,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red, #f43f5e)' }}>
            {section} gặp sự cố
          </div>
          {this.state.message && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
              {this.state.message}
            </div>
          )}
          <button
            type="button"
            onClick={this.reset}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(244,63,94,0.3)',
              background: 'transparent',
              color: 'var(--red, #f43f5e)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
