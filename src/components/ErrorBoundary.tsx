import { Component, type ComponentChildren, type VNode } from 'preact';

interface Props {
  // ComponentChildren (bukan VNode | VNode[] | string | null) karena boundary
  // ini membungkus anak hasil conditional rendering, yang bisa berupa false,
  // undefined, number, atau array campuran — semuanya valid di Preact.
  children: ComponentChildren;
  fallback?: VNode | string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center bg-canvas rounded-xl m-4 border border-line">
          <div className="w-16 h-16 bg-surface-raised rounded-full flex items-center justify-center mb-4 text-accent-red">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-fg mb-2">Terjadi Kesalahan (Crash)</h2>
          <p className="text-fg-muted mb-4 max-w-md">
            Maaf, komponen ini gagal dimuat karena suatu kesalahan internal. Silakan muat ulang halaman.
          </p>
          <div className="text-sm bg-surface p-4 rounded-lg w-full max-w-lg text-left overflow-x-auto text-accent-red font-mono border border-line">
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-surface-raised border border-line text-fg font-medium rounded-lg hover:bg-surface transition-colors cursor-pointer"
          >
            Muat Ulang Halaman
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
