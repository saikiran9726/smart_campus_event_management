import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorBoundary } from '@/components/primitives/error-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireAuth, RequireRole } from '@/lib/auth';

// Full Feature Implementations
const DiscoverPage = lazy(() => import('@/features/discovery/DiscoveryPage'));
const EventDetailPage = lazy(() => import('@/features/event/EventPage'));
const VerifyCertPage = lazy(() => import('@/features/verify/VerifyCertPage'));
const VerifyOdPage = lazy(() => import('@/features/verify/VerifyOdPage'));
const FacultyDecisionPage = lazy(() => import('@/features/faculty/FacultyDecisionPage'));
const FacultyDashboardPage = lazy(() => import('@/features/faculty/FacultyDashboardPage'));
const ScannerUnlockPage = lazy(() => import('@/features/scanner/ScannerUnlockPage'));
const ScannerPage = lazy(() => import('@/features/scanner/ScannerPage'));
const WaitlistClaimPage = lazy(() => import('@/features/claim/ClaimOfferPage'));

const PassportPage = lazy(() => import('@/features/passport/PassportPage'));
const CommunityPage = lazy(() => import('@/features/community/CommunityPage'));
const EventDoubtRoomPage = lazy(() => import('@/features/community/EventDoubtRoomPage'));
const OrganizerDashboard = lazy(() => import('@/features/organizer/OrganizerDashboard'));
const EventEditorPage = lazy(() => import('@/features/organizer/EventEditorPage'));
const FormBuilderPage = lazy(() => import('@/features/builder/FormBuilderPage'));
const GateOpsPage = lazy(() => import('@/features/organizer/GateOps'));
const TeamsPanelPage = lazy(() => import('@/features/organizer/TeamsPanel'));
const BudgetPage = lazy(() => import('@/features/organizer/BudgetPage'));
const AnalyticsPage = lazy(() => import('@/features/organizer/AnalyticsPage'));
const ProposalWizardPage = lazy(() => import('@/features/proposals/ProposalWizardPage'));
const ProposalsListPage = lazy(() => import('@/features/proposals/ProposalsListPage'));
const ClubSettingsPage = lazy(() => import('@/features/organizer/ClubSettingsPage'));

const AdminPage = lazy(() => import('@/routes/admin'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const NotFoundPage = lazy(() => import('@/features/error/NotFoundPage'));

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
          <Route path="/events/:slug/doubts" element={<EventDoubtRoomPage />} />
          <Route path="/verify/cert/:id" element={<VerifyCertPage />} />
          <Route path="/verify/od/:serial" element={<VerifyOdPage />} />
          <Route path="/faculty/decision" element={<FacultyDecisionPage />} />
          <Route path="/scanner/unlock" element={<ScannerUnlockPage />} />
          <Route path="/scanner" element={<ScannerPage />} />
          <Route path="/claim/:registrationId" element={<WaitlistClaimPage />} />

          {/* Authed Student & General Routes */}
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
          <Route path="/profile" element={<ProfilePage />} />

          {/* Faculty Dashboard */}
          <Route
            path="/faculty"
            element={
              <RequireAuth>
                <RequireRole roles={['FACULTY', 'ADMIN']}>
                  <FacultyDashboardPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          {/* Organizer Studio Routes */}
          <Route
            path="/organizer"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <OrganizerDashboard />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/new"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <EventEditorPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:eventId/edit"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <EventEditorPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:eventId/builder"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <FormBuilderPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:eventId/gate"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <GateOpsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:eventId/teams"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <TeamsPanelPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/budget"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <BudgetPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/analytics"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <AnalyticsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:eventId/analytics"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <AnalyticsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/proposals"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <ProposalsListPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/proposals/new"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <ProposalWizardPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/settings"
            element={
              <RequireAuth>
                <RequireRole roles={['ORGANIZER', 'FACULTY', 'ADMIN']}>
                  <ClubSettingsPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          {/* Admin Routes */}
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
          {/* Catch-all 404 Route */}
          <Route path="*" element={<NotFoundPage />} />
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
