const SESSION_KEY = 'staff_home_session';
const REMEMBER_FLAG = 'staff_remember';
const SHORT_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const LONG_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface StaffSession {
  name: string;
  employeeId: string;
  isAdmin?: boolean;
  permissions: string[];
  /** Supabase-compatible JWT minted by employee-auth. Absent when STAFF_JWT_SECRET
   *  is not configured server-side (falls back to anon-key behavior). */
  token?: string;
  expiresAt: number;
}

/** Read the staff session from localStorage (remembered) or sessionStorage */
export const getStaffSession = (): StaffSession | null => {
  try {
    // Check remembered (localStorage) first
    const remembered = localStorage.getItem(SESSION_KEY);
    if (remembered) {
      const s: StaffSession = JSON.parse(remembered);
      if (s.expiresAt > Date.now()) return s;
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_FLAG);
    }
    // Fall back to session-only
    const temp = sessionStorage.getItem(SESSION_KEY);
    if (temp) {
      const s: StaffSession = JSON.parse(temp);
      if (s.expiresAt > Date.now()) return s;
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }
  return null;
};

/** Save the staff session. If `remember` is true, persist in localStorage with 7-day expiry. */
export const setStaffSession = (session: Omit<StaffSession, 'expiresAt'>, remember: boolean) => {
  const duration = remember ? LONG_DURATION : SHORT_DURATION;
  const full: StaffSession = { ...session, expiresAt: Date.now() + duration };

  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(full));
    localStorage.setItem(REMEMBER_FLAG, '1');
    // Also set in sessionStorage so same-tab reads work uniformly
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(full));
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(full));
    // Clean up any old remembered session
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_FLAG);
  }
};

/** Clear the staff session from both storages */
export const clearStaffSession = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_FLAG);
  localStorage.removeItem('emp_id');
  localStorage.removeItem('emp_name');
};

/** Check if "remember me" was previously selected */
export const isRemembered = (): boolean => {
  return localStorage.getItem(REMEMBER_FLAG) === '1';
};

/** The current staff JWT, if one was issued at login. Used by the Supabase client
 *  to authenticate requests once RLS enforces claim-based access. */
export const getStaffToken = (): string | null => {
  return getStaffSession()?.token ?? null;
};
