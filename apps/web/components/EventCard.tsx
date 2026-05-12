import { clsx } from "clsx";

export type EventType =
  | "payout.completed"
  | "proof.verdict"
  | "ndvi.alert"
  | "sync.batch"
  | "connected"
  | string;

export interface PlatformEvent {
  id: string;
  type: EventType;
  timestamp: string;
  data: Record<string, unknown>;
  // "connected" ping has message instead of data
  message?: string;
}

interface EventCardProps {
  event: PlatformEvent;
}

const EVENT_META: Record<
  string,
  { label: string; colorClass: string; bgClass: string; borderClass: string }
> = {
  "payout.completed": {
    label: "Payout Completed",
    colorClass: "text-emerald-800",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
  },
  "proof.verdict": {
    label: "GPS Proof",
    colorClass: "text-blue-800",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
  },
  "ndvi.alert": {
    label: "NDVI Alert",
    colorClass: "text-yellow-800",
    bgClass: "bg-yellow-50",
    borderClass: "border-yellow-200",
  },
  "sync.batch": {
    label: "Mobile Sync",
    colorClass: "text-purple-800",
    bgClass: "bg-purple-50",
    borderClass: "border-purple-200",
  },
};

function getVerdictColor(verdict: string) {
  if (verdict === "VERIFIED") return "text-emerald-700 font-semibold";
  if (verdict === "SPOOFED") return "text-red-700 font-semibold";
  return "text-yellow-700 font-semibold";
}

function renderData(type: EventType, data: Record<string, unknown>) {
  if (type === "payout.completed") {
    return (
      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
        <div>
          <dt className="inline text-gray-500">Gross: </dt>
          <dd className="inline font-medium">
            ₹{Number(data.gross_amount ?? 0).toLocaleString("en-IN")}
          </dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Farmer gets: </dt>
          <dd className="inline font-medium text-emerald-700">
            ₹{Number(data.farmer_gets ?? 0).toLocaleString("en-IN")}
          </dd>
        </div>
        <div className="col-span-2 truncate">
          <dt className="inline text-gray-500">Txn: </dt>
          <dd className="inline font-mono">{String(data.txn_id ?? "").slice(0, 8)}…</dd>
        </div>
      </dl>
    );
  }

  if (type === "proof.verdict") {
    const verdict = String(data.verdict ?? "");
    return (
      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
        <div>
          <dt className="inline text-gray-500">Verdict: </dt>
          <dd className={clsx("inline", getVerdictColor(verdict))}>{verdict}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Accuracy: </dt>
          <dd className="inline">{Number(data.accuracy_m ?? 0).toFixed(1)} m</dd>
        </div>
        {data.spoof_reason && (
          <div className="col-span-2 truncate text-red-700">
            <dt className="inline text-gray-500">Reason: </dt>
            <dd className="inline">{String(data.spoof_reason)}</dd>
          </div>
        )}
      </dl>
    );
  }

  if (type === "ndvi.alert") {
    return (
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
        <div>
          <dt className="inline text-gray-500">NDVI: </dt>
          <dd className="inline font-semibold text-yellow-700">{String(data.ndvi_mean ?? "")}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Threshold: </dt>
          <dd className="inline">&lt; {String(data.threshold ?? "0.3")}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Source: </dt>
          <dd className="inline">{String(data.source ?? "")}</dd>
        </div>
      </dl>
    );
  }

  if (type === "sync.batch") {
    return (
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
        <div>
          <dt className="inline text-gray-500">Farmers: </dt>
          <dd className="inline font-medium">+{String(data.farmers_created ?? 0)}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Plots: </dt>
          <dd className="inline font-medium">+{String(data.plots_created ?? 0)}</dd>
        </div>
      </dl>
    );
  }

  return null;
}

export function EventCard({ event }: EventCardProps) {
  const meta = EVENT_META[event.type] ?? {
    label: event.type,
    colorClass: "text-gray-700",
    bgClass: "bg-gray-50",
    borderClass: "border-gray-200",
  };

  const ts = event.timestamp ? new Date(event.timestamp) : null;
  const timeStr = ts
    ? ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  return (
    <article
      className={clsx(
        "rounded-lg border p-3 transition-all",
        meta.bgClass,
        meta.borderClass
      )}
      aria-label={`${meta.label} event`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={clsx(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            meta.colorClass,
            meta.bgClass
          )}
        >
          {meta.label}
        </span>
        {timeStr && (
          <time
            dateTime={event.timestamp}
            className="shrink-0 text-xs text-gray-500 tabular-nums"
          >
            {timeStr}
          </time>
        )}
      </div>
      {renderData(event.type, event.data ?? {})}
    </article>
  );
}
