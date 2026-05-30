// portal/hooks/use-api-request.ts
'use client';

import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

function errorLabel(url: string): string {
  if (url.includes('/mail'))            return 'Mailserver niet bereikbaar';
  if (url.includes('/documents'))       return 'Paperless niet bereikbaar';
  if (url.includes('/document-types'))  return 'Documenttypes niet beschikbaar';
  if (url.includes('/calendar'))        return 'Agenda niet beschikbaar';
  if (url.includes('/tickets'))         return 'Taken niet beschikbaar';
  if (url.includes('/preferences'))     return 'Instellingen niet beschikbaar';
  if (url.includes('/ldap-profile'))    return 'Profieldata niet beschikbaar';
  if (url.includes('/notifications'))   return 'Meldingen niet beschikbaar';
  if (url.includes('/gateway'))         return 'Service tijdelijk niet bereikbaar';
  return 'Verbindingsfout — probeer opnieuw';
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries: number): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

export function useApiRequest() {
  const request = useCallback(async <T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T> => {
    let res: Response;
    try {
      res = await fetchWithRetry(url, options, MAX_RETRIES);
    } catch {
      toast.error(errorLabel(url));
      throw new Error(errorLabel(url));
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }, []);

  return { request };
}
