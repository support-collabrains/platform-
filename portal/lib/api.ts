function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `${window.location.origin}/api`;
  return 'http://localhost:3001';
}
const API_BASE = getApiBase();

export interface BootstrapConfig {
  primaryDomain?: string;
  mailDomain?: string;
  adminEmail?: string;
  hostname?: string;
  timezone?: string;
}

export interface BootstrapStateResponse {
  state: BootstrapState;
  isReady: boolean;
  log: BootstrapLogEntry[];
  config: BootstrapConfig | null;
}

export type BootstrapState =
  | 'UNINITIALIZED'
  | 'DNS_CHECK'
  | 'CREATING_SECRETS'
  | 'AUTHENTIK_SETUP'
  | 'MAILCOW_SETUP'
  | 'TRAEFIK_CONFIG'
  | 'READY';

export interface BootstrapLogEntry {
  state: BootstrapState;
  step: string;
  message: string;
  timestamp: string;
  error?: string;
}

export interface StartBootstrapPayload {
  primaryDomain: string;
  mailDomain: string;
  adminEmail: string;
  adminPassword: string;
  hostname: string;
  timezone: string;
}

export async function getBootstrapState(): Promise<BootstrapStateResponse> {
  const res = await fetch(`${API_BASE}/bootstrap/state`);
  if (!res.ok) throw new Error('Failed to fetch bootstrap state');
  return res.json();
}

export async function verifyDns(
  primaryDomain: string,
  mailDomain: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/bootstrap/verify-dns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryDomain, mailDomain }),
  });
  return res.json();
}

export async function verifyPorts(
  hostname: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/bootstrap/verify-ports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname }),
  });
  return res.json();
}

export async function startBootstrap(payload: StartBootstrapPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/bootstrap/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Failed to start bootstrap');
  }
}

export function createBootstrapEventSource(): EventSource {
  return new EventSource(`${API_BASE}/bootstrap/events`);
}
