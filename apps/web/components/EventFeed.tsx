"use client";

import { useEffect, useRef, useState } from "react";
import { EventCard, type PlatformEvent } from "./EventCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const DEMO_MODE = !API_URL;

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error";

const MAX_EVENTS = 50;

const DEMO_EVENTS: PlatformEvent[] = [
  {
    id: "demo-1",
    type: "payout.completed",
    timestamp: new Date(Date.now() - 8000).toISOString(),
    data: { txn_id: "txn-demo-001", gross_amount: 75000, farmer_gets: 37500 },
  },
  {
    id: "demo-2",
    type: "proof.verdict",
    timestamp: new Date(Date.now() - 22000).toISOString(),
    data: { verdict: "VERIFIED", accuracy_m: 4.2, farmer_id: "d457d2ae-2dae-4988-a0cc-fc5eda76cd76" },
  },
  {
    id: "demo-3",
    type: "ndvi.alert",
    timestamp: new Date(Date.now() - 45000).toISOString(),
    data: { ndvi_mean: "0.22", threshold: "0.30", source: "Sentinel-2" },
  },
  {
    id: "demo-4",
    type: "sync.batch",
    timestamp: new Date(Date.now() - 70000).toISOString(),
    data: { farmers_created: 3, plots_created: 5 },
  },
  {
    id: "demo-5",
    type: "payout.completed",
    timestamp: new Date(Date.now() - 95000).toISOString(),
    data: { txn_id: "txn-demo-002", gross_amount: 50000, farmer_gets: 25000 },
  },
  {
    id: "demo-6",
    type: "proof.verdict",
    timestamp: new Date(Date.now() - 130000).toISOString(),
    data: { verdict: "SPOOFED", accuracy_m: 0.3, spoof_reason: "GPS accuracy below 1m threshold" },
  },
];

function makeLiveEvent(): PlatformEvent {
  const roll = Math.random();
  const now = new Date().toISOString();
  if (roll < 0.4) {
    const gross = Math.floor(Math.random() * 80000 + 20000);
    return {
      id: `live-${Date.now()}`,
      type: "payout.completed",
      timestamp: now,
      data: { txn_id: `txn-${Date.now()}`, gross_amount: gross, farmer_gets: gross * 0.5 },
    };
  }
  if (roll < 0.65) {
    return {
      id: `live-${Date.now()}`,
      type: "proof.verdict",
      timestamp: now,
      data: { verdict: Math.random() > 0.15 ? "VERIFIED" : "SPOOFED", accuracy_m: +(Math.random() * 8 + 1).toFixed(1) },
    };
  }
  if (roll < 0.8) {
    return {
      id: `live-${Date.now()}`,
      type: "ndvi.alert",
      timestamp: now,
      data: { ndvi_mean: (Math.random() * 0.28 + 0.01).toFixed(2), threshold: "0.30", source: "Sentinel-2" },
    };
  }
  return {
    id: `live-${Date.now()}`,
    type: "sync.batch",
    timestamp: now,
    data: { farmers_created: Math.floor(Math.random() * 5 + 1), plots_created: Math.floor(Math.random() * 8 + 1) },
  };
}

export function EventFeed() {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (DEMO_MODE) {
      // Seed with historical events, then inject live events periodically
      setTimeout(() => {
        setStatus("connected");
        setEvents(DEMO_EVENTS);
      }, 800);

      const interval = setInterval(() => {
        setEvents((prev) => [makeLiveEvent(), ...prev].slice(0, MAX_EVENTS));
      }, 6000);

      return () => clearInterval(interval);
    }

    let closed = false;

    function connect() {
      if (closed) return;
      setStatus("connecting");

      const es = new EventSource(`${API_URL}/api/v1/events/stream`);
      esRef.current = es;

      es.onopen = () => {
        if (!closed) setStatus("connected");
      };

      es.onmessage = (e) => {
        if (closed) return;
        try {
          const event = JSON.parse(e.data) as PlatformEvent;
          // Skip the "connected" ping — it's an internal heartbeat
          if (event.type === "connected") return;
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        } catch {
          // Malformed event — ignore
        }
      };

      es.onerror = () => {
        if (closed) return;
        es.close();
        setStatus("reconnecting");
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
    };
  }, []);

  return (
    <section aria-labelledby="activity-feed-heading">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="activity-feed-heading" className="text-base font-semibold text-gray-900">
          Live Event Feed
        </h2>
        <StatusPill status={status} />
      </div>

      {events.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-sm text-gray-500"
        >
          {status === "connecting" || status === "reconnecting"
            ? "Connecting to event stream…"
            : "No events yet — waiting for platform activity"}
        </div>
      ) : (
        <ol
          aria-label="Platform events"
          aria-live="polite"
          aria-atomic="false"
          className="space-y-2"
        >
          {events.map((evt) => (
            <li key={evt.id}>
              <EventCard event={evt} />
            </li>
          ))}
        </ol>
      )}

      {events.length > 0 && (
        <p className="mt-3 text-xs text-gray-500 text-right">
          Showing {events.length} of last {MAX_EVENTS} events
        </p>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  const config = {
    connecting:   { dot: "bg-yellow-400 animate-pulse", text: "Connecting" },
    connected:    { dot: "bg-emerald-500",              text: "Live" },
    reconnecting: { dot: "bg-yellow-400 animate-pulse", text: "Reconnecting" },
    error:        { dot: "bg-red-500",                  text: "Error" },
  }[status];

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Stream status: ${config.text}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.text}
    </span>
  );
}
