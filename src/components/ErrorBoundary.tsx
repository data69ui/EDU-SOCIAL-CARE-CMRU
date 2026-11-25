import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Keep internal error details off the UI to avoid leaking internals.
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF6EE] px-4 py-12 text-[#23181A]">
          <div
            role="alert"
            className="w-full max-w-md rounded-2xl border border-[#DFD1BA] bg-white p-6 text-center shadow-lg space-y-4"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF2F2] text-[#991B1B]">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-display text-lg font-bold text-[#7A1629]">
                เกิดข้อผิดพลาดชั่วคราวในการแสดงผล
              </h1>
              <p className="text-xs sm:text-sm text-[#66585B] leading-relaxed">
                ระบบได้ป้องกันการหยุดทำงานของหน้าเว็บเรียบร้อยแล้ว กรุณากดปุ่มด้านล่างเพื่อโหลดหน้าเว็บใหม่
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7A1629] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5B0F1D] transition-colors"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>โหลดหน้าหลักใหม่</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
