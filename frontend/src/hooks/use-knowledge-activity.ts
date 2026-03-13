import { useEffect, useSyncExternalStore, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

export interface AgentActivity {
  documentId: string;
  type: 'status' | 'tool_call' | 'thinking' | 'text' | 'error' | 'complete';
  message: string;
  detail?: string;
  timestamp: number;
}

const MAX_EVENTS_PER_DOC = 200;
const STORAGE_KEY = 'knowledge_activity';

// ---- singleton store (lives outside React) ----

type Listener = () => void;

const eventsByDoc = new Map<string, AgentActivity[]>();
const listeners = new Set<Listener>();
let socket: Socket | null = null;
let refCount = 0;

// Version counter — incremented on every mutation so useSyncExternalStore
// detects changes (Map identity never changes, but the version does).
let version = 0;

// Restore persisted events on module load
try {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, AgentActivity[]>;
    for (const [docId, events] of Object.entries(parsed)) {
      eventsByDoc.set(docId, events);
    }
  }
} catch {
  // ignore corrupted storage
}

function persist() {
  try {
    const obj: Record<string, AgentActivity[]> = {};
    for (const [docId, events] of eventsByDoc) {
      obj[docId] = events;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // storage full or unavailable
  }
}

function notify() {
  version++;
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
  persist();
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

function getSnapshot(): number {
  return version;
}

// ---- React hook ----

/**
 * Subscribe to real-time agent activity events via WebSocket.
 *
 * @param documentId - If provided, returns events for that single document.
 *   If omitted, returns ALL events across all documents (flattened, sorted by timestamp).
 */
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

  // Subscribe to version changes — triggers re-render on every mutation
  const v = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const events = useMemo(() => {
    if (documentId) {
      return eventsByDoc.get(documentId) ?? [];
    }
    // Return all events across all documents, sorted by timestamp
    const all: AgentActivity[] = [];
    for (const list of eventsByDoc.values()) {
      all.push(...list);
    }
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, v]);

  const clear = useCallback(() => {
    if (documentId) {
      eventsByDoc.delete(documentId);
      persist();
      notify();
    }
  }, [documentId]);

  return { events, clear };
}

/**
 * Clear persisted activity events for specific document IDs.
 * Call this after processing is done so events don't linger.
 */
export function clearActivityForDocuments(docIds: string[]) {
  for (const id of docIds) {
    eventsByDoc.delete(id);
  }
  persist();
  notify();
}
