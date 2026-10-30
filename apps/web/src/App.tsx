import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorBoundary } from '@/components/primitives/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireAuth, RequireRole } from '@/lib/auth';

// Lazy-loaded routes
const DiscoverPage = lazy(() => import('@/routes/discover'));
const EventDetailPage = lazy(() => import('@/routes/event-detail'));
const VerifyCertPage = lazy(() => import('@/routes/verify-cert'));
const VerifyOdPage = lazy(() => import('@/routes/verify-od'));
const FacultyDecisionPage = lazy(() => import('@/routes/faculty-decision'));
const ScannerUnlockPage = lazy(() => import('@/routes/scanner-unlock'));
const WaitlistClaimPage = lazy(() => import('@/routes/waitlist-claim'));

const PassportPage = lazy(() => import('@/routes/passport'));
const CommunityPage = lazy(() => import('@/routes/community'));
const OrganizerPage = lazy(() => import('@/routes/organizer'));
const AdminPage = lazy(() => import('@/routes/admin'));
const ProfilePage = lazy(() => import('@/routes/profile'));

const PageFallback: React.FC = () => (
  <div className="container max-w-5xl py-8 px-4 sm:px-8 space-y-6 mx-auto animate-pulse">
    <Skeleton className="h-10 w-48" />
    <Skeleton className="h-4 w-72" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
      <Skeleton className="h-[440px] rounded-xl" />
      <Skeleton className="h-[440px] rounded-xl" />
      <Skeleton className="h-[440px] rounded-xl" />
    </div>
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          {/* Public Routes */}
          <Route path="/" element={<DiscoverPage />} />
          <Route path="/events/:slug" element={<EventDetailPage />} />
          <Route path="/verify/cert/:id" element={<VerifyCertPage />} />
          <Route path="/verify/od/:serial" element={<VerifyOdPage />} />
          <Route path="/faculty/decision" element={<FacultyDecisionPage />} />
          <Route path="/scanner/unlock" element={<ScannerUnlockPage />} />
          <Route path="/claim/:registrationId" element={<WaitlistClaimPage />} />

          {/* Authed Routes */}
          <Route
            path="/passport"
            element={
              <RequireAuth>
                <PassportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/community"
            element={
              <RequireAuth>
                <CommunityPage />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <OrganizerPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireRole roles={['ADMIN']}>
                  <AdminPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
