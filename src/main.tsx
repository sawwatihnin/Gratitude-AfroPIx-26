import React, {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack || ''}`.trim();
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: formatUnknownError(error) || 'Unknown runtime error',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Keep full details in console for debugging.
    console.error('App render crash:', error, info);
    this.setState({
      hasError: true,
      message: `${formatUnknownError(error)}\n\nComponent stack:\n${info.componentStack || '(none)'}`.trim(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: '24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5}}>
          <h1 style={{fontSize: '20px', marginBottom: '8px'}}>App failed to render</h1>
          <p style={{marginBottom: '8px'}}>A runtime error occurred. Open browser DevTools Console for full details.</p>
          <pre style={{whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '12px', borderRadius: '8px'}}>
            {this.state.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found');
}

const root = createRoot(rootEl);

async function bootstrap() {
  try {
    const {default: App} = await import('./App.tsx');
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    const message = formatUnknownError(error);
    console.error('Bootstrap/import crash:', error);
    root.render(
      <div style={{padding: '24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5}}>
        <h1 style={{fontSize: '20px', marginBottom: '8px'}}>App bootstrap failed</h1>
        <p style={{marginBottom: '8px'}}>The app module could not load. See details below.</p>
        <pre style={{whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '12px', borderRadius: '8px'}}>
          {message}
        </pre>
      </div>,
    );
  }
}

bootstrap();
