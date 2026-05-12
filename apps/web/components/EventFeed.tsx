"use client";

import { useEffect, useRef, useState } from "react";
import { EventCard, type PlatformEvent } from "./EventCard";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8888";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error";

const MAX_EVENTS = 50;

export function EventFeed() {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
