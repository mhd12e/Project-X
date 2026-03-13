import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ChatStreamEvent {
  conversationId: string;
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'source' | 'thinking' | 'status' | 'error' | 'done' | 'title_updated';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  description?: string;
  source?: {
    documentId: string;
    sourceFile: string;
    section: string;
    topic: string;
    score: number;
  };
  messageId?: string;
  timestamp: number;
}

export interface ChatActivity {
  type: ChatStreamEvent['type'];
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  description?: string;
  source?: ChatStreamEvent['source'];
  messageId?: string;
  timestamp: number;
}

/** Ordered segment in the streaming response — text and tool calls interleaved */
export type StreamSegment =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; toolInput?: string; description?: string; toolResult?: string }
  | { type: 'thinking'; content: string }
  | { type: 'source'; source: NonNullable<ChatStreamEvent['source']> };

// ---- singleton store (outside React) ----

type Listener = () => void;

// Activities: non-text events for finalization logic (done, error, status, etc.)
let activitiesByConv = new Map<string, ChatActivity[]>();
const activityListeners = new Set<Listener>();

// Ordered segments: interleaved text + tool blocks for rendering
let segmentsByConv = new Map<string, StreamSegment[]>();
const segmentListeners = new Set<Listener>();
let segmentFlushScheduled = false;

let socket: Socket | null = null;
let refCount = 0;

function notifyActivities() {
  for (const fn of activityListeners) fn();
}

function notifySegments() {
  for (const fn of segmentListeners) fn();
}

function scheduleSegmentFlush() {
  if (segmentFlushScheduled) return;
  segmentFlushScheduled = true;
  requestAnimationFrame(() => {
    segmentFlushScheduled = false;
    notifySegments();
  });
}

function pushActivity(convId: string, activity: ChatActivity) {
  const list = activitiesByConv.get(convId) ?? [];
  const next = [...list, activity];
  const updated = new Map(activitiesByConv);
  updated.set(convId, next.length > 500 ? next.slice(-500) : next);
  activitiesByConv = updated;
  notifyActivities();
}

function getOrCreateSegments(convId: string): StreamSegment[] {
  return segmentsByConv.get(convId) ?? [];
}

function setSegments(convId: string, segs: StreamSegment[]) {
  const updated = new Map(segmentsByConv);
  updated.set(convId, segs);
  segmentsByConv = updated;
}

function handleEvent(event: ChatStreamEvent) {
  const convId = event.conversationId;

  if (event.type === 'text_delta') {
    const segs = getOrCreateSegments(convId);
    const last = segs[segs.length - 1];

    if (last && last.type === 'text') {
      // Append to existing text segment (mutate a clone)
      const clone = [...segs];
      clone[clone.length - 1] = { type: 'text', content: last.content + (event.content ?? '') };
      setSegments(convId, clone);
    } else {
      // New text segment after a tool call or at the start
      setSegments(convId, [...segs, { type: 'text', content: event.content ?? '' }]);
    }
    scheduleSegmentFlush();
    return;
  }

  if (event.type === 'tool_call') {
    const segs = getOrCreateSegments(convId);
    setSegments(convId, [...segs, {
      type: 'tool_call',
      toolName: event.toolName ?? '',
      toolInput: event.toolInput,
      description: event.description,
    }]);
    // Tool calls render immediately (no batching)
    notifySegments();
  }

  if (event.type === 'tool_result') {
    // Update the last matching tool_call segment with the result
    const segs = getOrCreateSegments(convId);
    const clone = [...segs];
    for (let i = clone.length - 1; i >= 0; i--) {
      const seg = clone[i];
      if (seg.type === 'tool_call' && seg.toolName === event.toolName && !seg.toolResult) {
        clone[i] = { ...seg, toolResult: event.toolResult };
        break;
      }
    }
    setSegments(convId, clone);
    notifySegments();
  }

  if (event.type === 'source') {
    if (event.source) {
      const segs = getOrCreateSegments(convId);
      setSegments(convId, [...segs, { type: 'source', source: event.source }]);
      notifySegments();
    }
  }

  if (event.type === 'thinking') {
    if (event.content) {
      const segs = getOrCreateSegments(convId);
      setSegments(convId, [...segs, { type: 'thinking', content: event.content }]);
      notifySegments();
    }
  }

  // Flush segments immediately on done
  if (event.type === 'done') {
    notifySegments();
  }

  // All events also go to activities for finalization logic
  pushActivity(convId, {
    type: event.type,
    content: event.content,
    toolName: event.toolName,
    toolInput: event.toolInput,
    toolResult: event.toolResult,
    description: event.description,
    source: event.source,
    messageId: event.messageId,
    timestamp: event.timestamp,
  });
}

function connect() {
  if (socket) return;
  socket = io('/chat', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
  socket.on('chat:stream', handleEvent);
}

/** Ask backend to replay buffered state for an in-flight generation */
function subscribeToConversation(conversationId: string) {
  if (socket?.connected) {
    socket.emit('chat:subscribe', conversationId);
  }
}

function disconnect() {
  if (!socket) return;
  socket.off('chat:stream', handleEvent);
  socket.disconnect();
  socket = null;
}

function subscribeActivities(listener: Listener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

function getActivitiesSnapshot(): Map<string, ChatActivity[]> {
  return activitiesByConv;
}

function subscribeSegments(listener: Listener): () => void {
  segmentListeners.add(listener);
  return () => segmentListeners.delete(listener);
}

function getSegmentsSnapshot(): Map<string, StreamSegment[]> {
  return segmentsByConv;
}

// ---- React hook ----

export function useChatStream(conversationId?: string) {
  useEffect(() => {
    refCount++;
    connect();
    return () => {
      refCount--;
      if (refCount === 0) disconnect();
    };
  }, []);

  // Subscribe to conversation on mount and reconnect to catch in-flight generations
  useEffect(() => {
    if (!conversationId || !socket) return;

    if (socket.connected) {
      subscribeToConversation(conversationId);
    }

    const onConnect = () => subscribeToConversation(conversationId);
    socket.on('connect', onConnect);
    return () => { socket?.off('connect', onConnect); };
  }, [conversationId]);

  const activityStore = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesSnapshot);
  const segmentStore = useSyncExternalStore(subscribeSegments, getSegmentsSnapshot, getSegmentsSnapshot);

  const activities = conversationId ? activityStore.get(conversationId) ?? [] : [];
  const segments = conversationId ? segmentStore.get(conversationId) ?? [] : [];

  // Derive plain text from segments (for finalization content)
  const streamingText = segments
    .filter((s): s is Extract<StreamSegment, { type: 'text' }> => s.type === 'text')
    .map((s) => s.content)
    .join('');

  const clear = useCallback(() => {
    if (conversationId) {
      const updatedAct = new Map(activitiesByConv);
      updatedAct.delete(conversationId);
      activitiesByConv = updatedAct;

      const updatedSeg = new Map(segmentsByConv);
      updatedSeg.delete(conversationId);
      segmentsByConv = updatedSeg;

      notifyActivities();
      notifySegments();
    }
  }, [conversationId]);

  return { activities, segments, streamingText, clear };
}
