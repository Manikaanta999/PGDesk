import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/ToastContext';
import { getDashboardRouteForRole } from './lib/authRoles';
import { AboutPage, ContactPage, PrivacyPolicyPage, TermsPage } from './pages/InfoPages';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PublicListingPage } from './pages/PublicListingPage';
import { BillingPage } from './pages/dashboard/BillingPage';
import { ComplaintsPage } from './pages/dashboard/ComplaintsPage';
import { ExpensesPage } from './pages/dashboard/ExpensesPage';
import { LeadsPage } from './pages/dashboard/LeadsPage';
import { NoticesPage } from './pages/dashboard/NoticesPage';
import { OverviewPage } from './pages/dashboard/OverviewPage';
import { PropertiesPage } from './pages/dashboard/PropertiesPage';
import { SettingsPage } from './pages/dashboard/SettingsPage';
import { TenantDetailPage } from './pages/dashboard/TenantDetailPage';
import { TenantsPage } from './pages/dashboard/TenantsPage';
import { TenantPortalPage } from './pages/tenant/TenantPortalPage';

function RequireRoleRoute({
  allowed,
  children,
}: {
  allowed: Array<'OWNER' | 'MANAGER' | 'TENANT'>;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to={getDashboardRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <LanguageProvider>
          <AuthProvider>
            <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/pg/:slug" element={<PublicListingPage />} />

            <Route
              path="/dashboard"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <OverviewPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/properties"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <PropertiesPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/tenants"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <TenantsPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/tenants/:id"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <TenantDetailPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/billing"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <BillingPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/complaints"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <ComplaintsPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/notices"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <NoticesPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/leads"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <LeadsPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/expenses"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <ExpensesPage />
                </RequireRoleRoute>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <RequireRoleRoute allowed={['OWNER', 'MANAGER']}>
                  <SettingsPage />
                </RequireRoleRoute>
              }
            />

            <Route
              path="/tenant"
              element={
                <RequireRoleRoute allowed={['TENANT']}>
                  <TenantPortalPage />
                </RequireRoleRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </LanguageProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
