import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import Manager from './pages/Manager.jsx'
import Status from './pages/Status.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Join from './pages/Join.jsx'
import Members from './pages/Members.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import AuthLayout from './pages/auth/AuthLayout.jsx'
import Login from './pages/auth/Login.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* ── Auth pages (own layout, no app shell) ── */}
        <Route element={<AuthLayout />}>
          <Route path="/login"           element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        {/* ── App pages (shared header/nav shell) ── */}
        <Route element={<App />}>
          <Route index                   element={<Navigate to="/join" replace />} />
          <Route path="/manager"         element={<Manager />} />
          <Route path="/status/:stateCode" element={<Status />} />
          <Route path="/join"            element={<Join />} />
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/members"         element={<Members />} />
          <Route path="/settings"        element={<SettingsPage />} />
          <Route path="*"                element={<Navigate to="/join" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
