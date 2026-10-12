// Agency profile (name, address, phone, email, description, logo): stored on the server, shared by all staff.
import { useEffect, useSyncExternalStore } from 'react';
import api from '../api.js';
import { getToken } from '../auth/session.js';

const EMPTY = { name: '', address: '', phone: '', email: '', description: '', logo: '' };
let state = null;
let loading = false;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export async function loadProfile() {
  if (!getToken()) return null;
  loading = true;
  try { state = { ...EMPTY, ...(await api.companyProfile()) }; } catch { /* keep */ }
  loading = false;
  emit();
  return state;
}
export async function saveProfile(patch) {
  state = { ...EMPTY, ...(await api.saveCompanyProfile(patch)) };
  emit();
  return state;
}
export function useProfile() {
  const profile = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => null);
  useEffect(() => { if (!state && !loading) loadProfile(); }, []);
  return profile || EMPTY;
}
