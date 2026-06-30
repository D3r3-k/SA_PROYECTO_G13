import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './routes/ProtectedRoute'

import LoginPage          from './pages/LoginPage'
import RegisterPage       from './pages/RegisterPage'
import ProfilesPage       from './pages/ProfilesPage'
import CatalogPage        from './pages/CatalogPage'
import ContentDetailPage  from './pages/ContentDetailPage'
import SubscriptionsPage  from './pages/SubscriptionsPage'
import HistoryPage        from './pages/HistoryPage'
import AccountPage        from './pages/AccountPage'
import WatchPartyPage     from './pages/WatchPartyPage'
import DownloadsPage      from './pages/DownloadsPage'
import AdminLoginPage     from './pages/AdminLoginPage'
import AdminPage          from './pages/AdminPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Rutas públicas */}
          <Route path="/login"       element={<LoginPage />} />
          <Route path="/register"    element={<RegisterPage />} />
          <Route path="/login/admin" element={<AdminLoginPage />} />
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
          } />

          {/* Rutas protegidas */}
          <Route path="/profiles" element={
            <ProtectedRoute><ProfilesPage /></ProtectedRoute>
          } />
          <Route path="/catalog" element={
            <ProtectedRoute><CatalogPage /></ProtectedRoute>
          } />
          <Route path="/catalog/:contentId" element={
            <ProtectedRoute><ContentDetailPage /></ProtectedRoute>
          } />
          <Route path="/subscriptions" element={
            <ProtectedRoute><SubscriptionsPage /></ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute><HistoryPage /></ProtectedRoute>
          } />
          <Route path="/downloads" element={
            <ProtectedRoute><DownloadsPage /></ProtectedRoute>
          } />
          <Route path="/account" element={
            <ProtectedRoute><AccountPage /></ProtectedRoute>
          } />
          <Route path="/watch-party/:code" element={
            <ProtectedRoute><WatchPartyPage /></ProtectedRoute>
          } />

          {/* Redirect raíz */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
