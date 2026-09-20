import { useEffect, useRef, useState } from 'react';
import api from '../api.js';
import Layout from '../components/Layout.jsx';
import { Card, Mono, Spinner, Button, TextInput } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { shortDateTime } from '../format.js';

// A flat conversation list keyed by phone number — WhatsApp Business messages
// aren't necessarily tied to a candidate/client record, so this stays simple
// rather than trying to resolve each number to a CRM contact.
export default function WhatsApp() {
  const [connected, setConnected] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const threadEndRef = useRef(null);

  function loadConversations() {
    api.whatsappConversations().then((rows) => {
      setConversations(rows);
      // Keep the currently open thread selected across a refresh; otherwise
      // default to the most recently active conversation.
      setSelected((prev) => (prev && rows.some((r) => r.contact_phone === prev)) ? prev : (rows[0]?.contact_phone || null));
    });
  }

  useEffect(() => {
    api.whatsappStatus().then((s) => setConnected(s.connected));
    loadConversations();
    // Poll for new inbound messages — there's no push channel from the
    // server into the browser, so this is the simplest way to stay live.
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selected) {
      setMessages(null);
      return;
    }
    let cancelled = false;
    api.whatsappConversation(selected).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    const interval = setInterval(() => {
      api.whatsappConversation(selected).then((rows) => {
        if (!cancelled) setMessages(rows);
      });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selected]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, selected]);

  async function send() {
    const text = draft.trim();
    if (!text || !selected) return;
    setSending(true);
    setError(null);
    try {
      await api.whatsappSend(selected, text);
      setDraft('');
      const rows = await api.whatsappConversation(selected);
      setMessages(rows);
      loadConversations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (connected === false) {
    return (
      <Layout title="WhatsApp">
        <Card className="p-8 text-center max-w-md mx-auto mt-10">
          <span className="w-11 h-11 rounded-lg bg-greenTint text-green flex items-center justify-center mx-auto mb-3">
            <Icon name="phoneCall" size={18} />
          </span>
          <h3 className="font-display text-base font-semibold text-ink mb-1">WhatsApp isn't connected yet</h3>
          <p className="text-sm text-muted mb-4">Connect your company's WhatsApp Business number from Settings to start sending and receiving messages here.</p>
          <a href="#/settings">
            <Button>Go to Settings</Button>
          </a>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="WhatsApp">
      <Card className="flex h-[calc(100vh-9.5rem)] overflow-hidden">
        {/* Conversation list */}
        <div className="w-[280px] flex-shrink-0 border-r border-line flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-line flex-shrink-0">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {!conversations && <Spinner />}
            {conversations && conversations.length === 0 && (
              <p className="text-sm text-muted px-4 py-6 text-center">No messages yet. Incoming WhatsApp messages will show up here.</p>
            )}
            {conversations && conversations.map((c) => (
              <button
                key={c.contact_phone}
                type="button"
                onClick={() => setSelected(c.contact_phone)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-lineSoft transition-colors ${
                  selected === c.contact_phone ? 'bg-wash' : 'hover:bg-wash'
                }`}
              >
                <Mono name={c.contact_phone} color="#0E9488" size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{c.contact_phone}</p>
                  <p className="text-xs text-muted truncate">{c.direction === 'out' ? 'You: ' : ''}{c.body}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted">
              Select a conversation to view messages.
            </div>
          )}
          {selected && (
            <>
              <div className="px-5 py-3.5 border-b border-line flex items-center gap-2.5 flex-shrink-0">
                <Mono name={selected} color="#0E9488" size={32} />
                <p className="font-display text-[15px] font-semibold text-ink">{selected}</p>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-2.5 bg-wash/40">
                {!messages && <Spinner />}
                {messages && messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-xl px-3.5 py-2 text-sm ${
                        m.direction === 'out' ? 'bg-brand text-white' : 'bg-surface border border-line text-ink'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10.5px] mt-1 ${m.direction === 'out' ? 'text-white/70' : 'text-faint'}`}>
                        {shortDateTime(m.created_at)}{m.direction === 'out' && m.status ? ` · ${m.status}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>
              <div className="px-4 py-3 border-t border-line flex-shrink-0">
                {error && <p className="text-xs text-rose mb-2">{error}</p>}
                <div className="flex items-center gap-2">
                  <TextInput
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Type a message…"
                    disabled={sending}
                  />
                  <Button onClick={send} disabled={sending || !draft.trim()}>
                    {sending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </Layout>
  );
}
