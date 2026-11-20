import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("3D scene failed to start", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="scene-fallback">
          <p>The 3D office could not start in this browser (WebGL is unavailable).</p>
          <p>You can keep using the panel to hire employees, chat, and handle approvals.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
