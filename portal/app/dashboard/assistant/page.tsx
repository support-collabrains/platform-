'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Trash2, Sparkles, FileText, Mail, Calendar, RefreshCw } from 'lucide-react';
import { useT } from '../LangContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface QuickPrompt { icon: typeof FileText; label: string; prompt: string }

const QUICK_PROMPTS: QuickPrompt[] = [
  { icon: FileText, label: 'Documenten samenvatten', prompt: 'Geef me een overzicht van mijn recente documenten en de belangrijkste informatie erin.' },
  { icon: Mail,     label: 'Mail samenvatten',       prompt: 'Geef me een samenvatting van mijn ongelezen e-mails en de meest urgente berichten.' },
  { icon: Calendar, label: 'Agenda bekijken',         prompt: 'Wat staat er deze week op mijn agenda? Zijn er deadlines of afspraken waar ik rekening mee moet houden?' },
  { icon: Sparkles, label: 'Hulp & tips',             prompt: 'Wat kun jij allemaal doen als mijn Diggi Cloud assistent? Geef me een overzicht van je mogelijkheden.' },
];

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${
        isUser ? 'bg-blue-500/20' : 'bg-cyan-500/20'
      }`}>
        {isUser ? <User size={14} className="text-blue-400" /> : <Bot size={14} className="text-cyan-400" />}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-500 text-white rounded-tr-sm'
            : 'text-slate-200 rounded-tl-sm'
        }`} style={!isUser ? { background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' } : {}}>
          {msg.content}
        </div>
        <span className="text-[10px] text-slate-600 px-1">{formatTime(msg.ts)}</span>
      </div>
    </div>
  );
}

const STORAGE_KEY = 'diggi-chat-v1';
const MAX_STORED = 100;

export default function AssistantPage() {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore chat from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved) as Message[]);
    } catch { /* ignore */ }
  }, []);

  // Persist chat to localStorage whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch { /* ignore quota errors */ }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || t.aiError,
        ts: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t.aiError,
        ts: Date.now(),
      }]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }, [messages, thinking, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clear = () => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dc-bg)' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--dc-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Bot size={18} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">AI Assistent</h2>
            <p className="text-xs text-slate-500">Diggi Cloud · Ollama</p>
          </div>
        </div>
        {!isEmpty && (
          <button onClick={clear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition">
            <Trash2 size={13} />
            {t.aiClearChat}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 py-10">
            <div className="flex flex-col items-center gap-3 text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-2">
                <Bot size={32} className="text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-200">AI Assistent</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{t.aiWelcome}</p>
            </div>

            {/* Quick prompts */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {QUICK_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                <button key={label} onClick={() => sendMessage(prompt)}
                  className="flex items-start gap-2.5 p-3 rounded-xl text-left text-xs transition hover:bg-white/5"
                  style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
                  <Icon size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                  <span className="text-slate-300 leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {thinking && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <Bot size={14} className="text-cyan-400" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
                  style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-6 py-4" style={{ borderTop: '1px solid var(--dc-border)' }}>
        <div className="flex items-end gap-3 rounded-2xl p-1"
          style={{ background: 'var(--dc-surf2)', border: '1px solid var(--dc-border)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.aiPlaceholder}
            rows={1}
            className="flex-1 px-3 py-2.5 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 resize-none focus:outline-none leading-relaxed"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || thinking}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 mb-1"
            style={{ background: input.trim() && !thinking ? 'var(--dc-blue)' : 'var(--dc-border)' }}
          >
            {thinking
              ? <RefreshCw size={15} className="text-white animate-spin" />
              : <Send size={15} className="text-white" />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-700 text-center mt-2">Enter om te versturen · Shift+Enter voor nieuwe regel</p>
      </div>
    </div>
  );
}
