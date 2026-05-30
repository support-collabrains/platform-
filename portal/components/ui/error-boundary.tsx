// portal/components/ui/error-boundary.tsx
'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { hasError: true, message };
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8">
          <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center">
            <AlertCircle size={24} className="text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-200 mb-1">Er ging iets mis</p>
            <p className="text-xs text-slate-500 max-w-xs">{this.state.message}</p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition"
          >
            <RefreshCw size={14} />
            Opnieuw proberen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
