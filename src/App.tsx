import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Docs from './pages/Docs'
import Pitch from './pages/Pitch'
import LabsNotes from './pages/LabsNotes'
import Gitbook from './pages/Gitbook'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/pitch" element={<Pitch />} />
        <Route path="/labs/notes" element={<LabsNotes />} />
        <Route path="/gitbook" element={<Gitbook />} />
        <Route path="/gitbook/" element={<Gitbook />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
