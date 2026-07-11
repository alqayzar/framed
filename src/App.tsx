import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { HomeScreen } from '@/components/home/home-screen'
import { JoinScreen } from '@/components/join/join-screen'
import { RoomScreen } from '@/components/waiting-room/room-screen'
import { ToastProvider } from '@/hooks/use-toast'

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/join" element={<JoinScreen />} />
          <Route path="/room" element={<RoomScreen />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
