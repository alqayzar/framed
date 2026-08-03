import * as React from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'

import { HomeScreen } from '@/components/home/home-screen'
import { JoinScreen } from '@/components/join/join-screen'
import { WaitingRoom } from '@/components/waiting-room/waiting-room'
import { RoomScreen } from '@/components/waiting-room/room-screen'
import { PeerServerPreferenceProvider } from '@/hooks/use-peer-server-preference'
import { ToastProvider } from '@/hooks/use-toast'

function noop() {}

// Renders nothing — just keeps <html>'s no-overscroll class (see
// index.css) in sync with the route, so pull-to-refresh/rubber-band
// scroll-chaining is disabled everywhere except the home page. Needs
// Router context (useLocation), so it must render inside HashRouter,
// not alongside it.
function OverscrollGuard() {
  const location = useLocation()
  React.useEffect(() => {
    document.documentElement.classList.toggle('no-overscroll', location.pathname !== '/')
  }, [location.pathname])
  return null
}

function App() {
  return (
    <ToastProvider>
      <PeerServerPreferenceProvider>
        <HashRouter>
          <OverscrollGuard />
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/join" element={<JoinScreen />} />
            <Route path="/room" element={<RoomScreen />} />
            <Route
              path="/debug"
              element={
                <WaitingRoom role="host" roomCode="ABC123" playerId="debug-host" onLeave={noop} />
              }
            />
          </Routes>
        </HashRouter>
      </PeerServerPreferenceProvider>
    </ToastProvider>
  )
}

export default App
