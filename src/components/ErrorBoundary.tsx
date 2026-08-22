import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
          <h1 className="font-head text-[20px] font-bold text-chalk">Something went wrong</h1>
          <p className="max-w-sm text-[13px] text-mist">
            {this.state.message || 'An unexpected error occurred. Try refreshing the page.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-[10px] bg-amber px-5 py-2.5 font-head text-[14px] font-semibold text-amber-ink"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
