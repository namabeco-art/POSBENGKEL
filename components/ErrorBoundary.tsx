import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors in child components.
 * Prevents the entire app from crashing when a single page/module fails.
 * 
 * Usage:
 *   <ErrorBoundary fallbackTitle="Modul Kasir">
 *     <SalesPOS ... />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Modul';
      return (
        <div className="h-full flex flex-col items-center justify-center p-10 text-center space-y-6 animate-in fade-in duration-500">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center shadow-inner border-4 border-red-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              {title} Mengalami Error
            </h2>
            <p className="text-sm text-slate-500 font-semibold mt-2 max-w-md mx-auto">
              Terjadi kesalahan yang tidak terduga. Data Anda aman — coba muat ulang modul ini.
            </p>
            {this.state.error && (
              <details className="mt-4 text-left max-w-lg mx-auto">
                <summary className="text-xs font-bold text-slate-400 cursor-pointer hover:text-slate-600">
                  Detail Error (untuk developer)
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 rounded-xl text-xs text-red-600 overflow-auto max-h-40 font-mono">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\nComponent Stack:'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}
          </div>
          <button
            onClick={this.handleReset}
            className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all"
          >
            Muat Ulang Modul
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
