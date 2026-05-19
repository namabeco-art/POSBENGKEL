import { useState, useEffect, useCallback } from 'react';

/**
 * Lightweight hash-based router hook.
 * Enables browser back/forward navigation, deep linking, and bookmarking
 * without adding a router library dependency.
 * 
 * URL format: https://app.com/#dashboard, https://app.com/#pos
 */
export const useHashRouter = (defaultTab: string = 'dashboard') => {
  const getHashTab = () => {
    const hash = window.location.hash.slice(1); // Remove '#'
    return hash || defaultTab;
  };

  const [activeTab, setActiveTabState] = useState<string>(getHashTab);

  useEffect(() => {
    const handleHashChange = () => {
      const newTab = getHashTab();
      setActiveTabState(newTab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [defaultTab]);

  const setActiveTab = useCallback((tab: string) => {
    if (tab !== activeTab) {
      window.location.hash = tab;
      // State will be updated by hashchange event
    }
  }, [activeTab]);

  // Set initial hash if not present
  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = defaultTab;
    }
  }, [defaultTab]);

  return [activeTab, setActiveTab] as const;
};
