import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import Manager from './pages/Manager.jsx'
import Status from './pages/Status.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Join from './pages/Join.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Navigate to="/join" replace />} />
          <Route path="/manager" element={<Manager />} />
          <Route path="/status/:stateCode" element={<Status />} />
          <Route path="/join" element={<Join />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/manager" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
