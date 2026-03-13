import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface AgentActivity {
  documentId: string;
  type: 'status' | 'tool_call' | 'thinking' | 'text' | 'error' | 'complete';
  message: string;
  detail?: string;
  timestamp: number;
}

const MAX_EVENTS_PER_DOC = 200;

// ---- singleton store (lives outside React) ----

type Listener = () => void;

const eventsByDoc = new Map<string, AgentActivity[]>();
const listeners = new Set<Listener>();
let socket: Socket | null = null;
let refCount = 0;

function notify() {
  for (const fn of listeners) fn();
}

function handleActivity(activity: AgentActivity) {
  const docId = activity.documentId;
  const list = eventsByDoc.get(docId) ?? [];
  const next = [...list, activity];
  eventsByDoc.set(
    docId,
    next.length > MAX_EVENTS_PER_DOC ? next.slice(-MAX_EVENTS_PER_DOC) : next,
  );
  notify();
}

function connect() {
  if (socket) return;
  socket = io('/knowledge', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
  socket.on('agent:activity', handleActivity);
}

function disconnect() {
  if (!socket) return;
  socket.off('agent:activity', handleActivity);
  socket.disconnect();
  socket = null;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Map<string, AgentActivity[]> {
  return eventsByDoc;
}

// ---- React hook ----

export function useKnowledgeActivity(documentId?: string) {
  // ref-count the socket connection
  useEffect(() => {
    refCount++;
    connect();
    return () => {
      refCount--;
      if (refCount === 0) disconnect();
    };
  }, []);

  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const events = documentId ? store.get(documentId) ?? [] : [];

  const clear = useCallback(() => {
    if (documentId) {
      eventsByDoc.delete(documentId);
      notify();
    }
  }, [documentId]);

  return { events, clear };
}
