import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface ClubMembership {
  id: string;
  name: string;
  slug: string;
  description: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export interface ActiveClubContextValue {
  clubs: ClubMembership[];
  activeClub: ClubMembership | null;
  activeClubId: string | null;
  setActiveClubId: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetchClubs: () => void;
}

const ActiveClubContext = createContext<ActiveClubContextValue | null>(null);

export function useMyClubs() {
  const { isSignedIn } = useAuth();
  return useQuery<{ clubs: ClubMembership[] }>({
    queryKey: ['clubs', 'me'],
    queryFn: async () => {
      const res = await api.get<{ clubs?: ClubMembership[]; items?: ClubMembership[] }>(
        '/clubs/me',
        { showToast: false }
      );
      return { clubs: res.clubs || res.items || [] };
    },
    enabled: isSignedIn,
  });
}

export const ActiveClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: refetchClubs,
  } = useMyClubs();

  const clubs = useMemo(() => data?.clubs || [], [data?.clubs]);

  const storageKey = user?.id ? `eventora_active_club_${user.id}` : null;

  const [activeClubId, setActiveClubIdState] = useState<string | null>(() => {
    if (!storageKey) return null;
    return localStorage.getItem(storageKey);
  });

  // Reconcile and validate against fetched clubs
  useEffect(() => {
    if (!isSignedIn) {
      setActiveClubIdState(null);
      return;
    }

    if (isLoading) return;

    if (clubs.length === 0) {
      setActiveClubIdState(null);
      if (storageKey) localStorage.removeItem(storageKey);
      return;
    }

    // Check if current stored / selected activeClubId is valid in fetched memberships
    const currentId = activeClubId || (storageKey ? localStorage.getItem(storageKey) : null);
    const isValid = currentId && clubs.some((c) => c.id === currentId);

    if (isValid) {
      if (activeClubId !== currentId) {
        setActiveClubIdState(currentId);
      }
    } else {
      // Default to first membership
      const defaultId = clubs[0]?.id;
      if (defaultId) {
        setActiveClubIdState(defaultId);
        if (storageKey) {
          localStorage.setItem(storageKey, defaultId);
        }
      }
    }
  }, [clubs, isLoading, isSignedIn, storageKey, activeClubId]);

  const setActiveClubId = (newId: string) => {
    const exists = clubs.some((c) => c.id === newId);
    if (!exists) return;

    setActiveClubIdState(newId);
    if (storageKey) {
      localStorage.setItem(storageKey, newId);
    }
  };

  const activeClub = useMemo(() => {
    if (!activeClubId) return null;
    return clubs.find((c) => c.id === activeClubId) || null;
  }, [clubs, activeClubId]);

  const contextValue = useMemo<ActiveClubContextValue>(() => ({
    clubs,
    activeClub,
    activeClubId,
    setActiveClubId,
    isLoading,
    isError,
    error,
    refetchClubs: () => {
      void queryClient.invalidateQueries({ queryKey: ['clubs', 'me'] });
      void refetchClubs();
    },
  }), [clubs, activeClub, activeClubId, isLoading, isError, error, queryClient, refetchClubs]);

  return (
    <ActiveClubContext.Provider value={contextValue}>
      {children}
    </ActiveClubContext.Provider>
  );
};

export function useActiveClub(): ActiveClubContextValue {
  const context = useContext(ActiveClubContext);
  if (!context) {
    throw new Error('useActiveClub must be used within an ActiveClubProvider');
  }
  return context;
}
