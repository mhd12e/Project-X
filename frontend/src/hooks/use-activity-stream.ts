import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppDispatch } from '@/store';
import { prependLog, type ActivityLogEntry } from '@/store/activity.slice';

/**
 * Connects to the /activity WebSocket namespace and dispatches
 * incoming activity events into the Redux store in real-time.
 */
export function useActivityStream() {
  const dispatch = useAppDispatch();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io('/activity', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('activity:new', (entry: ActivityLogEntry) => {
      dispatch(prependLog(entry));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [dispatch]);
}
