"use client";

import { useEffect, useRef, useState } from "react";
import type { SseEvent } from "@/lib/events/types";

interface UseSseOptions {
  url: string;
  maxBuffer?: number;
}

/**
 * Subscribe to the server SSE stream. Keeps the last `maxBuffer` events.
 * Auto-reconnects via EventSource's built-in behavior.
 */
export function useSse({ url, maxBuffer = 12 }: UseSseOptions) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data) as SseEvent;
        // Skip the initial heartbeat hello if desired
        if (payload.type === "heartbeat" && payload.id === "init") return;
        setEvents((prev) => {
          const next = [...prev, payload];
          return next.length > maxBuffer ? next.slice(-maxBuffer) : next;
        });
      } catch {
        /* ignore */
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url, maxBuffer]);

  return { events, connected };
}
