import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import { BRAND } from './config/brand';

// Route-level code splitting keeps the initial ITSM Center bundle small.
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const CMDBInventoryPage = lazy(() => import('./pages/CMDBInventoryPage'));
const CIRelationshipsPage = lazy(() => import('./pages/CIRelationshipsPage'));
const ReportsAnalyticsPage = lazy(() => import('./pages/ReportsAnalyticsPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function FullPageSpinner({ tip }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" tip={tip}>
        <div style={{ width: 120, height: 60 }} />
      </Spin>
    </div>
  );
}

function ProtectedApp() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <FullPageSpinner tip={`Initializing ${BRAND.name}...`} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <Suspense fallback={<FullPageSpinner tip="Loading module..." />}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/cmdb" element={<CMDBInventoryPage />} />
          <Route path="/relationships" element={<CIRelationshipsPage />} />
          <Route path="/reports" element={<ReportsAnalyticsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  const { user, initializing } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={!initializing && user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/*" element={<ProtectedApp />} />
    </Routes>
  );
}
