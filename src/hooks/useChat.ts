/**
 * Group chat state: initial load, realtime merge, optimistic sends with idempotent
 * retries (client ids), pagination, and gap-filling after reconnects.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { backend } from '@/services/backend';
import type { Message, MessagePayload } from '@/types/models';
import { qk } from './data';

export function sortMessages(list: Message[]): Message[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Merge incoming messages, replacing optimistic copies that share a clientId. */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  const clientIndex = new Map<string, string>();
  for (const m of current) {
    byId.set(m.id, m);
    if (m.clientId) clientIndex.set(m.clientId, m.id);
  }
  for (const m of incoming) {
    const optimisticId = m.clientId ? clientIndex.get(m.clientId) : undefined;
    if (optimisticId && optimisticId !== m.id) byId.delete(optimisticId);
    byId.set(m.id, { ...m, status: 'sent' });
  }
  return sortMessages(Array.from(byId.values()));
}

export function useChat(groupId: string) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(true);
  const [connection, setConnection] = useState<'connected' | 'reconnecting' | 'offline'>('connected');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const list = await backend().messages.list(groupId, { limit: 50 });
      if (!mounted.current) return;
      setError(null);
      setMessages((cur) => mergeMessages(cur.filter((m) => m.status === 'sending' || m.status === 'failed'), list));
      setHasMore(list.length >= 50);
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    mounted.current = true;
    // load() only sets state after awaiting the network, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    backend().groups.markRead(groupId).catch(() => {});
    const unsub = backend().realtime.subscribe(`group:${groupId}`, (e) => {
      if (e.type === 'message' && e.groupId === groupId) {
        setMessages((cur) => mergeMessages(cur, [e.message]));
        backend().groups.markRead(groupId).catch(() => {});
      }
      if (e.type === 'message_deleted') setMessages((cur) => cur.filter((m) => m.id !== e.id));
      if (e.type === 'poll') {
        qc.invalidateQueries({ queryKey: qk.poll(e.pollId) });
        qc.invalidateQueries({ queryKey: qk.polls(groupId) });
      }
    });
    let wasDisconnected = false;
    const unsubConn = backend().realtime.subscribe('connection', (e) => {
      if (e.type !== 'connection') return;
      setConnection(e.status);
      if (e.status !== 'connected') wasDisconnected = true;
      else if (wasDisconnected) {
        wasDisconnected = false;
        load(); // fill any gap missed while offline
      }
    });
    return () => {
      mounted.current = false;
      unsub();
      unsubConn();
      qc.invalidateQueries({ queryKey: qk.groups });
    };
  }, [groupId, load, qc]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => m.status !== 'sending' && m.status !== 'failed');
    if (!oldest || !hasMore) return;
    const older = await backend().messages.list(groupId, { before: oldest.createdAt, limit: 50 });
    setHasMore(older.length >= 50);
    setMessages((cur) => mergeMessages(cur, older));
  }, [groupId, messages, hasMore]);

  const sendRaw = useCallback(
    async (optimistic: Message) => {
      setMessages((cur) => mergeMessages(cur.filter((m) => m.id !== optimistic.id), []).concat({ ...optimistic, status: 'sending' }));
      try {
        const saved = await backend().messages.send(groupId, {
          body: optimistic.body,
          clientId: optimistic.clientId!,
          kind: optimistic.kind === 'share' ? 'share' : 'text',
          payload: optimistic.payload,
        });
        setMessages((cur) => mergeMessages(cur, [saved]));
        return saved;
      } catch (e) {
        setMessages((cur) => cur.map((m) => (m.id === optimistic.id ? { ...m, status: 'failed' } : m)));
        throw e;
      }
    },
    [groupId],
  );

  const send = useCallback(
    (body: string, opts: { kind?: 'text' | 'share'; payload?: MessagePayload; senderId: string }) => {
      const clientId = Crypto.randomUUID();
      const optimistic: Message = {
        id: `local_${clientId}`,
        groupId,
        senderId: opts.senderId,
        kind: opts.kind ?? 'text',
        body,
        payload: opts.payload ?? null,
        clientId,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      return sendRaw(optimistic);
    },
    [groupId, sendRaw],
  );

  const retry = useCallback((m: Message) => sendRaw(m), [sendRaw]);

  return { messages, loading, error, reload: load, loadOlder, hasMore, send, retry, connection };
}
