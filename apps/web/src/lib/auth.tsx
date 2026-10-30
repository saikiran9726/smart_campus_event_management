import React, { createContext, useContext, useEffect, useMemo } from 'react';
import {
  ClerkProvider,
  useUser as useClerkUser,
  useAuth as useClerkAuth,
} from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { api, setAuthTokenGetter } from './api';
import { env } from '@/env';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/primitives/empty-state';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

export interface DbUser {
  id: string;
  clerkId: string;
  email: string;
  fullName: string;
  rollNumber?: string | null;
  department?: string | null;
  collegeYear?: number | null;
  phone?: string | null;
  role: 'STUDENT' | 'FACULTY' | 'ADMIN' | 'ORGANIZER';
  cooldownUntil?: string | null;
  createdAt: string;
}

export interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: DbUser | null;
  clerkUser: ReturnType<typeof useClerkUser>['user'];
  getToken: () => Promise<string | null>;
  isAdmin: boolean;
  isFaculty: boolean;
  isClubOrganizer: boolean;
  hasRole: (roles: string | string[]) => boolean;
  refetchUser: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useClerkUser();
  const { getToken, signOut } = useClerkAuth();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!isSignedIn) return null;
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [isSignedIn, getToken]);

  const {
    data: dbUserData,
    isLoading: isDbUserLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<{ user: DbUser }>('/me', { showToast: false });
      return res.user;
    },
    enabled: !!isSignedIn,
    staleTime: 1000 * 60 * 5,
  });

  const user = dbUserData || null;
  const isLoaded = isClerkLoaded && (!isSignedIn || !isDbUserLoading);

  const isAdmin = user?.role === 'ADMIN';
  const isFaculty = user?.role === 'FACULTY' || isAdmin;
  const isClubOrganizer = user?.role === 'ORGANIZER' || isFaculty || isAdmin;

  const hasRole = (roles: string | string[]): boolean => {
    if (!user) return false;
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (allowed.includes('*')) return true;
    if (user.role === 'ADMIN') return true;
    return allowed.map((r) => r.toUpperCase()).includes(user.role.toUpperCase());
  };

  const value = useMemo(
    () => ({
      isLoaded,
      isSignedIn: !!isSignedIn,
      user,
      clerkUser,
      getToken,
      isAdmin,
      isFaculty,
      isClubOrganizer,
      hasRole,
      refetchUser,
      signOut,
    }),
    [isLoaded, isSignedIn, user, clerkUser, getToken, isAdmin, isFaculty, isClubOrganizer, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export interface RequireAuthProps {
  children?: React.ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="p-8 space-y-4 max-w-4xl mx-auto" data-testid="auth-loading-skeleton">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export interface RequireRoleProps {
  roles: string | string[];
  children?: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ roles, children, fallback }) => {
  const { isLoaded, hasRole } = useAuth();

  if (!isLoaded) {
    return (
      <div className="p-8 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!hasRole(roles)) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="container max-w-3xl py-12 px-4" data-testid="role-forbidden-view">
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10 text-rose-500" />}
          title="Access Restricted"
          description="Your current student or campus role does not have authorization to view this panel."
          action={
            <Button variant="outline" onClick={() => window.history.back()}>
              Return Back
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
};

export const EventoraClerkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <AuthProvider>{children}</AuthProvider>
    </ClerkProvider>
  );
};
