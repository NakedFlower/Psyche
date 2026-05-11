import { Routes, Route } from 'react-router-dom'
import Home from './pages/home'
import Survey from './pages/survey'
import Weight from './pages/weight'
import Chat from './pages/chat'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/survey" element={<Survey />} />
      <Route path="/weight" element={<Weight />} />
      <Route path="/chat" element={<Chat />} />
    </Routes>
  )
}

export default App
