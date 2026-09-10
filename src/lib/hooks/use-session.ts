'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type SessionState = {
  sessionChecked: boolean;
  isLoggedIn:     boolean;
  userId:         string;
  userEmail:      string;
};

/**
 * Tracks the Supabase auth session and reacts to login/logout events.
 * Used by both home (page.tsx) and dashboard.
 */
export function useSession(): SessionState {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn,     setIsLoggedIn]     = useState(false);
  const [userId,         setUserId]         = useState('');
  const [userEmail,      setUserEmail]      = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const s = data.session;
      setIsLoggedIn(!!s);
      setUserEmail(s?.user?.email ?? '');
      setUserId(s?.user?.id ?? '');
      setSessionChecked(true);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setIsLoggedIn(!!s);
      setUserEmail(s?.user?.email ?? '');
      setUserId(s?.user?.id ?? '');
      setSessionChecked(true);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  return { sessionChecked, isLoggedIn, userId, userEmail };
}
