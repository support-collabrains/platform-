'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

interface AssistantCtx {
  messages: Message[];
  thinking: boolean;
  sendMessage: (text: string) => void;
  clear: () => void;
}

const Ctx = createContext<AssistantCtx>({
  messages: [],
  thinking: false,
  sendMessage: () => {},
  clear: () => {},
});

export const useAssistant = () => useContext(Ctx);

const STORAGE_KEY = 'diggi-chat-v1';
const MAX_STORED = 100;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  // Ref so the streaming loop always has the latest id without re-creating sendMessage
  const streamingId = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved) as Message[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch { /* ignore quota errors */ }
  }, [messages]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed, ts: Date.now() };
    const assistantId = `a-${Date.now() + 1}`;
    streamingId.current = assistantId;

    setMessages(prev => [...prev, userMsg]);
    setThinking(true);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    }).then(async res => {
      if (!res.ok || !res.body) throw new Error('stream failed');

      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', ts: Date.now() }]);
      setThinking(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const { token } = JSON.parse(payload) as { token: string };
            if (token) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + token } : m
              ));
            }
          } catch { /* skip */ }
        }
      }
      streamingId.current = null;
    }).catch(() => {
      setThinking(false);
      streamingId.current = null;
      setMessages(prev => {
        const has = prev.some(m => m.id === assistantId);
        const errMsg: Message = { id: assistantId, role: 'assistant', content: 'Sorry, ik kan momenteel geen antwoord geven.', ts: Date.now() };
        return has ? prev.map(m => m.id === assistantId ? errMsg : m) : [...prev, errMsg];
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, thinking]);

  const clear = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return <Ctx.Provider value={{ messages, thinking, sendMessage, clear }}>{children}</Ctx.Provider>;
}
