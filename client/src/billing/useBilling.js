// Plan, limits and usage of this installation (GET /api/billing/status), shared by every screen that needs it
// (sidebar locks, locked pages, the plan card). One request, refreshed after a purchase or a limit error.
import { useEffect, useSyncExternalStore } from 'react';
import api from '../api.js';
import { getToken } from '../auth/session.js';

let state = null;
let loading = false;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function refreshBilling() {
  if (!getToken()) return null;
  loading = true;
  try { state = await api.billingStatus(); } catch { /* keep the last value */ }
  loading = false;
  emit();
  return state;
}

export function useBilling() {
  const billing = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => null);
  useEffect(() => { if (!state && !loading) refreshBilling(); }, []);
  return { billing, refresh: refreshBilling };
}

// Lowest plan label for a locked area (matches FEATURE_MIN_PLAN on the server).
export const FEATURE_PLAN = { timesheets: 'essencial', whatsapp: 'essencial', portal: 'essencial', messaging: 'essencial', ai: 'completo' };
export const PLAN_NAMES = { basico: 'Basic', essencial: 'Essential', completo: 'Complete' };
