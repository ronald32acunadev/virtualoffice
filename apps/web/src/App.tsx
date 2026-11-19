import { getToken } from "./api/client";
import { OfficeProvider, useOffice } from "./state/OfficeProvider";
import { OfficeScene } from "./scene/OfficeScene";
import { SceneErrorBoundary } from "./scene/SceneErrorBoundary";
import { SidePanel } from "./ui/SidePanel";

function Shell() {
  const { state } = useOffice();
  return (
    <div className="app">
      <main className="scene-pane">
        <SceneErrorBoundary>
          <OfficeScene />
        </SceneErrorBoundary>
        <div className={`connection connection-${state.connection}`}>
          {state.connection === "online" ? "Connected" : state.connection === "connecting" ? "Connecting..." : "Reconnecting..."}
        </div>
      </main>
      <SidePanel />
    </div>
  );
}

export function App() {
  if (!getToken()) {
    return (
      <div className="no-token">
        <h1>Virtual Office</h1>
        <p>Open the office using the link printed in the terminal.</p>
      </div>
    );
  }
  return (
    <OfficeProvider>
      <Shell />
    </OfficeProvider>
  );
}
