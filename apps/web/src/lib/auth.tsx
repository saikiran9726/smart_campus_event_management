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
  year?: number | null;
  yearOfStudy?: number | null;
  collegeYear?: number | null;
  phone?: string | null;
  role: 'STUDENT' | 'FACULTY' | 'ADMIN' | 'ORGANIZER';
  strikeCount?: number;
  strikesCount?: number;
  consecutiveNoShows?: number;
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

const isClerkKeyValid =
  Boolean(env.VITE_CLERK_PUBLISHABLE_KEY) &&
  !env.VITE_CLERK_PUBLISHABLE_KEY.includes('dummy') &&
  !env.VITE_CLERK_PUBLISHABLE_KEY.includes('placeholder') &&
  (env.VITE_CLERK_PUBLISHABLE_KEY.startsWith('pk_test_') || env.VITE_CLERK_PUBLISHABLE_KEY.startsWith('pk_live_'));

export const ClerkAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useClerkUser();
  const { getToken, signOut: clerkSignOut } = useClerkAuth();

  const testUserId =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('eventora_test_user_id') || localStorage.getItem('eventora_test_user_id')
      : null;
  const effectiveIsSignedIn = Boolean(isSignedIn || testUserId);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (testUserId) return 'test-token';
      if (!isSignedIn) return null;
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [isSignedIn, getToken, testUserId]);

  const {
    data: dbUserData,
    isLoading: isDbUserLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['me', testUserId],
    queryFn: async () => {
      const res = await api.get<{ user: DbUser }>('/me', { showToast: false });
      return res.user;
    },
    enabled: effectiveIsSignedIn,
    staleTime: 1000 * 60 * 5,
  });

  const user = dbUserData || null;
  const isLoaded = (isClerkLoaded || Boolean(testUserId)) && (!effectiveIsSignedIn || !isDbUserLoading);

  const isAdmin = user?.role === 'ADMIN';
  const isFaculty = user?.role === 'FACULTY' || isAdmin;
  const isClubOrganizer = user?.role === 'ORGANIZER' || isFaculty || isAdmin;

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('eventora_test_user_id');
      localStorage.removeItem('eventora_test_user_id');
    }
    await clerkSignOut();
  };

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
      isSignedIn: effectiveIsSignedIn,
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
    [isLoaded, effectiveIsSignedIn, user, clerkUser, getToken, isAdmin, isFaculty, isClubOrganizer, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const MockAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [testUserId, setTestUserId] = React.useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('eventora_test_user_id') || localStorage.getItem('eventora_test_user_id');
    }
    return null;
  });

  useEffect(() => {
    const checkStorage = () => {
      const current =
        sessionStorage.getItem('eventora_test_user_id') || localStorage.getItem('eventora_test_user_id');
      if (current !== testUserId) {
        setTestUserId(current);
      }
    };
    checkStorage();
    window.addEventListener('storage', checkStorage);
    const interval = setInterval(checkStorage, 500);
    return () => {
      window.removeEventListener('storage', checkStorage);
      clearInterval(interval);
    };
  }, [testUserId]);

  const effectiveIsSignedIn = Boolean(testUserId);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (testUserId) return 'test-token';
      return null;
    });
  }, [testUserId]);

  const {
    data: dbUserData,
    isLoading: isDbUserLoading,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['me', testUserId],
    queryFn: async () => {
      const res = await api.get<{ user: DbUser }>('/me', { showToast: false });
      return res.user;
    },
    enabled: effectiveIsSignedIn,
    staleTime: 1000 * 60 * 5,
  });

  const user = dbUserData || null;
  const isLoaded = !effectiveIsSignedIn || !isDbUserLoading;

  const isAdmin = user?.role === 'ADMIN';
  const isFaculty = user?.role === 'FACULTY' || isAdmin;
  const isClubOrganizer = user?.role === 'ORGANIZER' || isFaculty || isAdmin;

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('eventora_test_user_id');
      localStorage.removeItem('eventora_test_user_id');
      setTestUserId(null);
    }
  };

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
      isSignedIn: effectiveIsSignedIn,
      user,
      clerkUser: null,
      getToken: async () => (testUserId ? 'test-token' : null),
      isAdmin,
      isFaculty,
      isClubOrganizer,
      hasRole,
      refetchUser,
      signOut,
    }),
    [isLoaded, effectiveIsSignedIn, user, isAdmin, isFaculty, isClubOrganizer, signOut, testUserId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = (props) => {
  return isClerkKeyValid ? <ClerkAuthProvider {...props} /> : <MockAuthProvider {...props} />;
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
  if (!isClerkKeyValid) {
    return <MockAuthProvider>{children}</MockAuthProvider>;
  }

  return (
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ClerkAuthProvider>{children}</ClerkAuthProvider>
    </ClerkProvider>
  );
};
