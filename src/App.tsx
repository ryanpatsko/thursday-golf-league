import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Admin from './Admin.tsx'
import Home from './Home.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}
