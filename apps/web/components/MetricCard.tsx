import { type ReactNode } from "react";
import { clsx } from "clsx";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "error";
  loading?: boolean;
  "aria-label"?: string;
}

const variantStyles = {
  default: "bg-white border-gray-200",
  success: "bg-white border-brand-200",
  warning: "bg-white border-yellow-200",
  error:   "bg-white border-red-200",
};

const iconStyles = {
  default: "bg-gray-100 text-gray-600",
  success: "bg-brand-100 text-brand-700",
  warning: "bg-yellow-100 text-yellow-700",
  error:   "bg-red-100 text-red-700",
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  variant = "default",
  loading = false,
  "aria-label": ariaLabel,
}: MetricCardProps) {
  return (
    <article
      className={clsx(
        "rounded-xl border-2 p-6 shadow-sm transition-shadow hover:shadow-md",
        variantStyles[variant]
      )}
      aria-label={ariaLabel ?? title}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-600 truncate">{title}</p>
          {loading ? (
            <div
              className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200"
              aria-hidden="true"
            />
          ) : (
            <p className="mt-1 text-3xl font-bold text-gray-900 tabular-nums">
              {value}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-gray-600">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div
            className={clsx(
              "flex-shrink-0 rounded-lg p-3",
              iconStyles[variant]
            )}
            aria-hidden="true"
          >
            <>{icon}</>
          </div>
        )}
      </div>
    </article>
  );
}
