import { createContext, useContext, type ReactNode } from 'react';
import type useAdvisorController from '../hooks/useAdvisorController';

type AdvisorContextValue = ReturnType<typeof useAdvisorController>;

const AdvisorContext = createContext<AdvisorContextValue | null>(null);

export function AdvisorProvider({
  value,
  children
}: {
  value: AdvisorContextValue;
  children: ReactNode;
}) {
  return (
    <AdvisorContext.Provider value={value}>
      {children}
    </AdvisorContext.Provider>
  );
}

export function useAdvisorContext() {
  const value = useContext(AdvisorContext);
  if (!value) throw new Error('useAdvisorContext must be used inside AdvisorProvider');
  return value;
}
