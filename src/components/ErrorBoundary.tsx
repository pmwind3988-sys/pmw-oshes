/**
 * ErrorBoundary.tsx — Catches render errors and shows a fallback UI
 * instead of crashing the entire page.
 */
import { Component } from "react";
import { MessageCard } from "./simple/MessageCard";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <MessageCard
          mood="error"
          title="Something went wrong"
          body="An unexpected error occurred. Try again, and if it keeps happening, let the OSHES team know."
          primary={{ label: "Try again", onClick: () => window.location.reload() }}
          details={this.state.error?.stack || this.state.error?.message || "Unknown error"}
        />
      );
    }

    return this.props.children;
  }
}
