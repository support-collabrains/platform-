'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Server } from 'lucide-react';

import StepIndicator from './components/StepIndicator';
import LogStream from './components/LogStream';
import {
  verifyDns,
  verifyPorts,
  startBootstrap,
  createBootstrapEventSource,
  type BootstrapLogEntry,
  type StartBootstrapPayload,
} from '@/lib/api';

type UIStep = 1 | 2 | 3 | 4 | 5;

interface FormData {
  primaryDomain: string;
  mailDomain: string;
  hostname: string;
  timezone: string;
  adminEmail: string;
  adminPassword: string;
  adminPasswordConfirm: string;
}

const TIMEZONES = Intl.supportedValuesOf('timeZone');

export default function SetupPage() {
  const [uiStep, setUiStep] = useState<UIStep>(1);
  const [form, setForm] = useState<FormData>({
    primaryDomain: '',
    mailDomain: '',
    hostname: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logEntries, setLogEntries] = useState<BootstrapLogEntry[]>([]);
  const [dnsVerified, setDnsVerified] = useState(false);
  const [portsVerified, setPortsVerified] = useState(false);

  const field = (key: keyof FormData) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  // ── Step 2: DNS & port check ──────────────────────────────────────────

  const runDnsCheck = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await verifyDns(form.primaryDomain, form.mailDomain);
      if (!result.ok) throw new Error(result.error);
      setDnsVerified(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runPortCheck = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await verifyPorts(form.hostname);
      if (!result.ok) throw new Error(result.error);
      setPortsVerified(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Step 4: Live provisioning ─────────────────────────────────────────

  const launchBootstrap = useCallback(async () => {
    setError(null);
    setBusy(true);
    setUiStep(4);

    const payload: StartBootstrapPayload = {
      primaryDomain: form.primaryDomain,
      mailDomain: form.mailDomain,
      adminEmail: form.adminEmail,
      adminPassword: form.adminPassword,
      hostname: form.hostname,
      timezone: form.timezone,
    };

    try {
      await startBootstrap(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }

    // Stream events via SSE
    const es = createBootstrapEventSource();
    es.onmessage = (evt) => {
      const entry: BootstrapLogEntry = JSON.parse(evt.data);
      setLogEntries((prev) => [...prev, entry]);
      if (entry.state === 'READY') {
        es.close();
        setBusy(false);
        setUiStep(5);
      }
      if (entry.error) {
        setError(entry.error);
        es.close();
        setBusy(false);
      }
    };
    es.onerror = () => {
      setError('Lost connection to provisioning stream. Refresh to reconnect.');
      es.close();
      setBusy(false);
    };
  }, [form]);

  // ── Render helpers ────────────────────────────────────────────────────

  const inputCls =
    'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const ErrorBanner = () =>
    error ? (
      <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mt-4">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    ) : null;

  // ── Step panels ───────────────────────────────────────────────────────

  const Step1 = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">System Identity</h2>
      <p className="text-sm text-slate-500">
        These values are permanent — they define your platform's identity.
      </p>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Primary domain</span>
        <input
          {...field('primaryDomain')}
          placeholder="platform.example.com"
          className={`mt-1 ${inputCls}`}
        />
        <span className="text-xs text-slate-400 mt-0.5 block">
          Portal, auth, and API will live under this domain.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Mail domain</span>
        <input
          {...field('mailDomain')}
          placeholder="mail.example.com"
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Server hostname / IP</span>
        <input
          {...field('hostname')}
          placeholder="1.2.3.4 or vps.example.com"
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Timezone</span>
        <select {...field('timezone')} className={`mt-1 ${inputCls}`}>
          {TIMEZONES.map((tz) => (
            <option key={tz}>{tz}</option>
          ))}
        </select>
      </label>

      <ErrorBanner />

      <button
        onClick={() => {
          if (!form.primaryDomain || !form.mailDomain || !form.hostname) {
            setError('All fields are required.');
            return;
          }
          setError(null);
          setUiStep(2);
        }}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition"
      >
        Continue →
      </button>
    </div>
  );

  const Step2 = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">DNS & Connectivity</h2>
      <p className="text-sm text-slate-500">
        Your DNS and ports must be ready before provisioning. These checks are hard blocks.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm font-mono text-slate-700">
        <div>A record: <strong>{form.primaryDomain}</strong> → your server IP</div>
        <div>MX record: <strong>{form.mailDomain}</strong></div>
        <div>Ports open: <strong>80, 443</strong> on {form.hostname}</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={runDnsCheck}
          disabled={busy || dnsVerified}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            dnsVerified
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-white border border-slate-300 hover:border-blue-400 text-slate-700'
          }`}
        >
          {dnsVerified ? '✓ DNS OK' : 'Check DNS'}
        </button>
        <button
          onClick={runPortCheck}
          disabled={busy || portsVerified}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            portsVerified
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-white border border-slate-300 hover:border-blue-400 text-slate-700'
          }`}
        >
          {portsVerified ? '✓ Ports OK' : 'Check Ports'}
        </button>
      </div>

      <ErrorBanner />

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => setUiStep(1)}
          className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          ← Back
        </button>
        <button
          onClick={() => setUiStep(3)}
          disabled={!dnsVerified || !portsVerified}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 transition"
        >
          Continue →
        </button>
      </div>
    </div>
  );

  const Step3 = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Admin Account</h2>
      <p className="text-sm text-slate-500">
        Your admin password is only shown once at the end of provisioning. Store it immediately.
      </p>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Admin email</span>
        <input
          {...field('adminEmail')}
          type="email"
          placeholder="admin@example.com"
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Admin password</span>
        <input
          {...field('adminPassword')}
          type="password"
          placeholder="Minimum 12 characters"
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Confirm password</span>
        <input
          {...field('adminPasswordConfirm')}
          type="password"
          className={`mt-1 ${inputCls}`}
        />
      </label>

      <ErrorBanner />

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => setUiStep(2)}
          className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          ← Back
        </button>
        <button
          onClick={() => {
            if (!form.adminEmail || !form.adminPassword) {
              setError('All fields are required.');
              return;
            }
            if (form.adminPassword.length < 12) {
              setError('Password must be at least 12 characters.');
              return;
            }
            if (form.adminPassword !== form.adminPasswordConfirm) {
              setError('Passwords do not match.');
              return;
            }
            setError(null);
            launchBootstrap();
          }}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition"
        >
          Provision platform →
        </button>
      </div>
    </div>
  );

  const Step4 = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Provisioning in progress…</h2>
      <p className="text-sm text-slate-500">
        Do not close this window. Authentik, Mailcow, and Traefik are being configured live.
      </p>
      <LogStream entries={logEntries} />
      <ErrorBanner />
    </div>
  );

  const Step5 = () => (
    <div className="text-center space-y-6 py-4">
      <CheckCircle2 size={64} className="text-emerald-500 mx-auto" />
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Platform is live</h2>
        <p className="text-slate-500 mt-1">
          Your self-hosted control plane is fully operational.
        </p>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-left space-y-1.5 font-mono">
        <div>Portal: <a href={`https://portal.${form.primaryDomain}`} className="text-blue-600 hover:underline">portal.{form.primaryDomain}</a></div>
        <div>Auth: <a href={`https://auth.${form.primaryDomain}`} className="text-blue-600 hover:underline">auth.{form.primaryDomain}</a></div>
        <div>Mail: <a href={`https://mail.${form.mailDomain}`} className="text-blue-600 hover:underline">mail.{form.mailDomain}</a></div>
      </div>
      <a
        href={`https://portal.${form.primaryDomain}`}
        className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg transition"
      >
        Open portal →
      </a>
    </div>
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Server size={28} className="text-blue-600" />
            <span className="text-2xl font-bold text-slate-800">Platform Setup</span>
          </div>
          <p className="text-slate-500 text-sm">
            Self-hosted control plane — one-time installation
          </p>
        </div>

        <StepIndicator currentStep={uiStep} />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {uiStep === 1 && <Step1 />}
          {uiStep === 2 && <Step2 />}
          {uiStep === 3 && <Step3 />}
          {uiStep === 4 && <Step4 />}
          {uiStep === 5 && <Step5 />}
        </div>
      </div>
    </main>
  );
}
