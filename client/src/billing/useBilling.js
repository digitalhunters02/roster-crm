// Plan, limits and usage of this installation (GET /api/billing/status), shared by every screen that needs it
// (sidebar locks, locked pages, the plan card). One request, refreshed after a purchase or a limit error.
import { useEffect, useSyncExternalStore } from 'react';
import api from '../api.js';
import { getToken } from '../auth/session.js';

let state = null;
let loading = false;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

let inflight = null;
export function refreshBilling() {
  if (!getToken()) return Promise.resolve(null);
  if (inflight) return inflight; // several screens asking at the same moment share one request
  loading = true;
  inflight = (async () => {
    try { state = await api.billingStatus(); } catch { /* keep the last value */ }
    loading = false;
    inflight = null;
    emit();
    return state;
  })();
  return inflight;
}

// Signed out (or another login): forget the last answer.
export function clearBilling() { state = null; emit(); }

export function useBilling() {
  const billing = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => null);
  useEffect(() => { if (!state && !loading) refreshBilling(); }, []);
  return { billing, refresh: refreshBilling };
}

// Plan names as shown in English (the screens translate them with t()).
export const PLAN_NAMES = { basico: 'Basic', essencial: 'Essential', completo: 'Complete' };
