import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppDispatch } from '@/store';
import { prependLog, type ActivityLogEntry } from '@/store/activity.slice';

/**
 * Connects to the /activity WebSocket namespace and dispatches
 * incoming activity events into the Redux store in real-time.
 *
 * Uses a singleton socket with ref-counting so multiple components
 * can mount this hook without creating duplicate connections.
 */

let socket: Socket | null = null;
let refCount = 0;
let dispatchRef: ReturnType<typeof useAppDispatch> | null = null;

function connect() {
  if (socket) return;
  socket = io('/activity', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
  socket.on('activity:new', (entry: ActivityLogEntry) => {
    dispatchRef?.(prependLog(entry));
  });
}

function disconnect() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}

export function useActivityStream() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatchRef = dispatch;
    refCount++;
    connect();
    return () => {
      refCount--;
      if (refCount === 0) {
        disconnect();
        dispatchRef = null;
      }
    };
  }, [dispatch]);
}
