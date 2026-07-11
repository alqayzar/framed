import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { HomeScreen } from '@/components/home/home-screen'
import { JoinScreen } from '@/components/join/join-screen'
import { WaitingRoom } from '@/components/waiting-room/waiting-room'
import { RoomScreen } from '@/components/waiting-room/room-screen'
import { ToastProvider } from '@/hooks/use-toast'

function noop() {}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/join" element={<JoinScreen />} />
          <Route path="/room" element={<RoomScreen />} />
          <Route
            path="/debug"
            element={
              <WaitingRoom role="host" roomCode="ABC123" onLeave={noop} />
            }
          />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
