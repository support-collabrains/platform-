'use client';

import { useEffect, useState, useRef } from 'react';
import { CheckCircle2, Loader2, ExternalLink, AlertCircle, Users } from 'lucide-react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import {
  getBootstrapState,
  createBootstrapEventSource,
  type BootstrapState,
  type BootstrapLogEntry,
} from '@/lib/api';

const STATE_LABEL: Record<string, string> = {
  UNINITIALIZED: 'Initialising…',
  DNS_CHECK: 'Checking DNS & connectivity',
  CREATING_SECRETS: 'Generating secrets',
  AUTHENTIK_SETUP: 'Configuring authentication',
  MAILCOW_SETUP: 'Configuring mail server (Mailcow)',
  TRAEFIK_CONFIG: 'Configuring routing (Traefik)',
  READY: 'Complete',
};

interface Config {
  primaryDomain?: string;
  mailDomain?: string;
}

export default function Home() {
  const [state, setState] = useState<BootstrapState>('UNINITIALIZED');
  const [log, setLog] = useState<BootstrapLogEntry[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [hasError, setHasError] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getBootstrapState()
      .then(({ state: s, log: l, config: c }) => {
        setState(s);
        setLog(l);
        if (c) setConfig(c);
      })
      .catch(() => {});

    const es = createBootstrapEventSource();
    es.onmessage = (evt) => {
      const entry: BootstrapLogEntry = JSON.parse(evt.data) as BootstrapLogEntry;
      setState(entry.state);
      if (entry.error) setHasError(true);
      setLog((prev) => {
        const key = `${entry.step}:${entry.message}`;
        if (prev.some((e) => `${e.step}:${e.message}` === key)) return prev;
        return [...prev, entry];
      });
      if (entry.state === 'READY') es.close();
    };
    es.onerror = () => {
      // SSE will auto-reconnect; don't show error for transient drops
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Re-fetch config once the SSE stream delivers READY
  useEffect(() => {
    if (state === 'READY' && !config.primaryDomain) {
      getBootstrapState()
        .then(({ config: c }) => { if (c) setConfig(c); })
        .catch(() => {});
    }
  }, [state, config.primaryDomain]);

  const domain = config.primaryDomain ?? '';
  const mailDomain = config.mailDomain ?? '';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <Logo width={140} height={70} />
          </div>
          <p className="text-slate-500 text-sm">Self-hosted control plane</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {state === 'READY' ? (
            <Dashboard domain={domain} mailDomain={mailDomain} />
          ) : (
            <Provisioning state={state} log={log} hasError={hasError} logEndRef={logEndRef} />
          )}
        </div>
      </div>
    </main>
  );
}

function Provisioning({
  state,
  log,
  hasError,
  logEndRef,
}: {
  state: BootstrapState;
  log: BootstrapLogEntry[];
  hasError: boolean;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {hasError ? (
          <AlertCircle size={24} className="text-red-500 flex-shrink-0" />
        ) : (
          <Loader2 size={24} className="text-blue-600 animate-spin flex-shrink-0" />
        )}
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {hasError ? 'Provisioning encountered an issue' : 'Provisioning platform…'}
          </h2>
          <p className="text-sm text-slate-500">{STATE_LABEL[state] ?? state}</p>
        </div>
      </div>

      <div className="bg-slate-950 rounded-lg p-4 h-72 overflow-y-auto font-mono text-xs">
        {log.length === 0 ? (
          <span className="text-slate-500">Waiting for first event…</span>
        ) : (
          log.map((entry, i) => (
            <div key={i} className={`leading-5 ${entry.error ? 'text-red-400' : 'text-emerald-400'}`}>
              <span className="text-slate-500 select-none">[{entry.step}] </span>
              {entry.message}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {hasError && (
        <p className="text-xs text-slate-500 text-center">
          Check the server logs for details. Refresh to retry connection.
        </p>
      )}
    </div>
  );
}

function Dashboard({ domain, mailDomain }: { domain: string; mailDomain: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 size={32} className="text-emerald-500 flex-shrink-0" />
        <div>
          <h2 className="text-xl font-bold text-slate-800">Platform is live</h2>
          <p className="text-sm text-slate-500">All services operational</p>
        </div>
      </div>

      <div className="space-y-2">
        <Link
          href="/users"
          className="flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition group"
        >
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <div className="text-sm font-medium text-blue-800">Gebruikersbeheer</div>
          </div>
          <ExternalLink size={16} className="text-blue-300 group-hover:text-blue-600 transition" />
        </Link>
        {domain && (
          <ServiceLink
            href={`https://auth.${domain}`}
            label="Authentication"
            sub={`auth.${domain}`}
          />
        )}
        {domain && (
          <ServiceLink
            href={`https://docs.${domain}`}
            label="Documents (Paperless)"
            sub={`docs.${domain}`}
          />
        )}
        {mailDomain && (
          <ServiceLink
            href={`https://mail.${mailDomain}`}
            label="Webmail (SOGo)"
            sub={`mail.${mailDomain}`}
          />
        )}
        {mailDomain && (
          <ServiceLink
            href={`https://mail.${mailDomain}/admin`}
            label="Mail admin"
            sub={`mail.${mailDomain}/admin`}
          />
        )}
      </div>
    </div>
  );
}

function ServiceLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition group"
    >
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 font-mono">{sub}</div>
      </div>
      <ExternalLink size={16} className="text-slate-400 group-hover:text-blue-600 transition" />
    </a>
  );
}
