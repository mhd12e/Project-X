import { useEffect, useSyncExternalStore, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

export interface StreamEvent {
  conversationId: string;
  type:
    | 'text_delta' | 'tool_call' | 'tool_result' | 'source' | 'thinking'
    | 'status' | 'error' | 'done' | 'title_updated'
    | 'idea_generated' | 'image_generating' | 'image_complete' | 'image_error';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  description?: string;
  source?: { documentId: string; sourceFile: string; section: string; topic: string; score: number };
  idea?: { id: string; title: string; description: string; category?: string };
  imageId?: string;
  imageUrl?: string;
  messageId?: string;
  timestamp: number;
}

export interface StreamActivity {
  type: StreamEvent['type'];
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
  description?: string;
  source?: StreamEvent['source'];
  idea?: StreamEvent['idea'];
  imageId?: string;
  imageUrl?: string;
  messageId?: string;
  timestamp: number;
}

export type StreamSegment =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; toolInput?: string; description?: string; toolResult?: string }
  | { type: 'thinking'; content: string }
  | { type: 'source'; source: NonNullable<StreamEvent['source']> };

// ---- singleton store ----

type Listener = () => void;

let activitiesByConv = new Map<string, StreamActivity[]>();
const activityListeners = new Set<Listener>();

let segmentsByConv = new Map<string, StreamSegment[]>();
const segmentListeners = new Set<Listener>();
let segmentFlushScheduled = false;

let socket: Socket | null = null;
let refCount = 0;

function notifyActivities() { for (const fn of activityListeners) fn(); }
function notifySegments() { for (const fn of segmentListeners) fn(); }

function scheduleSegmentFlush() {
  if (segmentFlushScheduled) return;
  segmentFlushScheduled = true;
  requestAnimationFrame(() => { segmentFlushScheduled = false; notifySegments(); });
}

function pushActivity(convId: string, activity: StreamActivity) {
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

function handleEvent(event: StreamEvent) {
  const cid = event.conversationId;

  if (event.type === 'text_delta') {
    const segs = getOrCreateSegments(cid);
    const last = segs[segs.length - 1];
    if (last && last.type === 'text') {
      const clone = [...segs];
      clone[clone.length - 1] = { type: 'text', content: last.content + (event.content ?? '') };
      setSegments(cid, clone);
    } else {
      setSegments(cid, [...segs, { type: 'text', content: event.content ?? '' }]);
    }
    scheduleSegmentFlush();
    return;
  }

  if (event.type === 'tool_call') {
    const segs = getOrCreateSegments(cid);
    setSegments(cid, [...segs, {
      type: 'tool_call',
      toolName: event.toolName ?? '',
      toolInput: event.toolInput,
      description: event.description,
    }]);
    notifySegments();
  }

  if (event.type === 'tool_result') {
    const segs = getOrCreateSegments(cid);
    const clone = [...segs];
    for (let i = clone.length - 1; i >= 0; i--) {
      const seg = clone[i];
      if (seg.type === 'tool_call' && seg.toolName === event.toolName && !seg.toolResult) {
        clone[i] = { ...seg, toolResult: event.toolResult };
        break;
      }
    }
    setSegments(cid, clone);
    notifySegments();
  }

  if (event.type === 'source' && event.source) {
    const segs = getOrCreateSegments(cid);
    setSegments(cid, [...segs, { type: 'source', source: event.source }]);
    notifySegments();
  }

  if (event.type === 'thinking' && event.content) {
    const segs = getOrCreateSegments(cid);
    setSegments(cid, [...segs, { type: 'thinking', content: event.content }]);
    notifySegments();
  }

  if (event.type === 'done') notifySegments();

  pushActivity(cid, {
    type: event.type,
    content: event.content,
    toolName: event.toolName,
    toolInput: event.toolInput,
    toolResult: event.toolResult,
    description: event.description,
    source: event.source,
    idea: event.idea,
    imageId: event.imageId,
    imageUrl: event.imageUrl,
    messageId: event.messageId,
    timestamp: event.timestamp,
  });
}

function connect() {
  if (socket) return;
  socket = io('/conversation', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
  socket.on('conversation:stream', handleEvent);
}

function subscribeToConversation(conversationId: string) {
  if (socket?.connected) socket.emit('conversation:subscribe', conversationId);
}

function disconnect() {
  if (!socket) return;
  socket.off('conversation:stream', handleEvent);
  socket.disconnect();
  socket = null;
}

function subscribeActivities(listener: Listener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}
function getActivitiesSnapshot(): Map<string, StreamActivity[]> { return activitiesByConv; }
function subscribeSegments(listener: Listener): () => void {
  segmentListeners.add(listener);
  return () => segmentListeners.delete(listener);
}
function getSegmentsSnapshot(): Map<string, StreamSegment[]> { return segmentsByConv; }

// ---- React hook ----

const EMPTY_ACTIVITIES: StreamActivity[] = [];
const EMPTY_SEGMENTS: StreamSegment[] = [];
const EMPTY_IDEAS: Array<{ id: string; title: string; description: string; category?: string }> = [];

export function useConversationStream(conversationId?: string) {
  useEffect(() => {
    refCount++;
    connect();
    return () => { refCount--; if (refCount === 0) disconnect(); };
  }, []);

  useEffect(() => {
    if (!conversationId || !socket) return;
    if (socket.connected) subscribeToConversation(conversationId);
    const onConnect = () => subscribeToConversation(conversationId);
    socket.on('connect', onConnect);
    return () => { socket?.off('connect', onConnect); };
  }, [conversationId]);

  const activityStore = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesSnapshot);
  const segmentStore = useSyncExternalStore(subscribeSegments, getSegmentsSnapshot, getSegmentsSnapshot);

  const activities = conversationId ? activityStore.get(conversationId) ?? EMPTY_ACTIVITIES : EMPTY_ACTIVITIES;
  const segments = conversationId ? segmentStore.get(conversationId) ?? EMPTY_SEGMENTS : EMPTY_SEGMENTS;

  const streamingText = segments
    .filter((s): s is Extract<StreamSegment, { type: 'text' }> => s.type === 'text')
    .map((s) => s.content)
    .join('');

  const streamedIdeas = useMemo(
    () => {
      const ideas = activities
        .filter((a) => a.type === 'idea_generated' && a.idea)
        .map((a) => a.idea!);
      return ideas.length > 0 ? ideas : EMPTY_IDEAS;
    },
    [activities],
  );

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

  return { activities, segments, streamingText, streamedIdeas, clear };
}
