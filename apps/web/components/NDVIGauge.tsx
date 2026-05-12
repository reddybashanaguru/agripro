import { clsx } from "clsx";

interface Props {
  value: number;   // 0–1
  plotId: string;
  source?: string;
  observedAt?: string;
  size?: "sm" | "md" | "lg";
}

function getColor(v: number) {
  if (v >= 0.5) return { bar: "bg-brand-500", label: "Healthy", text: "text-brand-700" };
  if (v >= 0.3) return { bar: "bg-yellow-400", label: "Moderate", text: "text-yellow-700" };
  return { bar: "bg-red-500", label: "Stressed", text: "text-red-700" };
}

export function NDVIGauge({ value, plotId, source, observedAt, size = "md" }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const { bar, label, text } = getColor(value);
  const shortId = plotId.slice(0, 8);

  return (
    <div
      className={clsx("rounded-lg border bg-white p-4", {
        "p-3": size === "sm",
        "p-4": size === "md",
        "p-6": size === "lg",
      })}
      role="region"
      aria-label={`NDVI gauge for plot ${shortId}: ${value.toFixed(2)} — ${label}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-mono text-gray-600">Plot {shortId}…</p>
          {source && (
            <p className="text-xs text-gray-600">{source}</p>
          )}
        </div>
        <div className="text-right">
          <p className={clsx("text-lg font-bold tabular-nums", text)}>
            {value.toFixed(2)}
          </p>
          <p className={clsx("text-xs font-semibold", text)}>{label}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 w-full rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`NDVI ${value.toFixed(2)}`}
      >
        <div
          className={clsx("h-2 rounded-full transition-all", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Threshold marker at 0.3 */}
      <div className="relative mt-1 h-1">
        <div
          className="absolute top-0 h-3 w-0.5 bg-red-400 -translate-y-1/2"
          style={{ left: "30%" }}
          aria-hidden="true"
          title="Payout threshold (0.30)"
        />
      </div>

      {observedAt && (
        <p className="mt-2 text-xs text-gray-600">
          Observed:{" "}
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
            new Date(observedAt)
          )}
        </p>
      )}
    </div>
  );
}
