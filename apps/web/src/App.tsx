import { useState } from "react";
import { getToken } from "./api/client";
import { OfficeProvider } from "./state/OfficeProvider";
import { resolveRoute } from "./state/routing";
import { OfficeView } from "./views/OfficeView";
import { WorkspaceView } from "./views/WorkspaceView";

function currentView() {
  const route = resolveRoute(location.pathname, location.search);
  if (route.redirectTo) {
    try {
      history.replaceState(null, "", route.redirectTo);
    } catch {
      // Keep rendering the workspace even when the URL cannot be rewritten.
    }
  }
  return route.view;
}

export function App() {
  const [view] = useState(currentView);
  if (!getToken()) {
    return (
      <div className="no-token">
        <h1>Virtual Office</h1>
        <p>Open the office using the link printed in the terminal.</p>
      </div>
    );
  }
  return <OfficeProvider>{view === "office" ? <OfficeView /> : <WorkspaceView />}</OfficeProvider>;
}
