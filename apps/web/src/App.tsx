import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './routes/ProtectedRoute'

import LoginPage        from './pages/LoginPage'
import RegisterPage     from './pages/RegisterPage'
import ProfilesPage     from './pages/ProfilesPage'
import CatalogPage      from './pages/CatalogPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import HistoryPage      from './pages/HistoryPage'
import AccountPage      from './pages/AccountPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Rutas públicas */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Rutas protegidas */}
          <Route path="/profiles" element={
            <ProtectedRoute><ProfilesPage /></ProtectedRoute>
          } />
          <Route path="/catalog" element={
            <ProtectedRoute><CatalogPage /></ProtectedRoute>
          } />
          <Route path="/subscriptions" element={
            <ProtectedRoute><SubscriptionsPage /></ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute><HistoryPage /></ProtectedRoute>
          } />
          <Route path="/account" element={
            <ProtectedRoute><AccountPage /></ProtectedRoute>
          } />

          {/* Redirect raíz */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
