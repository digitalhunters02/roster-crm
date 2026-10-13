// Offices of the agency (Complete plan). Shared list for the forms and the filters; empty on other plans.
import { useEffect, useSyncExternalStore } from 'react';
import api from '../api.js';
import { getToken } from '../auth/session.js';

let state = null;
let loading = false;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function loadOffices() {
  if (!getToken()) return null;
  loading = true;
  try { state = await api.offices(); } catch { state = []; }
  loading = false;
  emit();
  return state;
}
export function useOffices() {
  const offices = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => null);
  useEffect(() => { if (!state && !loading) loadOffices(); }, []);
  return offices || [];
}
