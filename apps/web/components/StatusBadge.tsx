import { clsx } from "clsx";

interface StatusBadgeProps {
  status: string;
  variant?: "success" | "warning" | "error" | "neutral";
}

const variantClasses = {
  success: "bg-brand-100 text-brand-800 ring-brand-200",
  warning: "bg-yellow-100 text-yellow-800 ring-yellow-200",
  error:   "bg-red-100 text-red-800 ring-red-200",
  neutral: "bg-gray-100 text-gray-700 ring-gray-200",
};

function autoVariant(status: string): StatusBadgeProps["variant"] {
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "VERIFIED") return "success";
  if (s === "PENDING" || s === "PROCESSING") return "warning";
  if (s === "FAILED" || s === "REVERSED" || s === "REJECTED" || s === "SPOOFED") return "error";
  return "neutral";
}

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const v = variant ?? autoVariant(status);
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        variantClasses[v ?? "neutral"]
      )}
    >
      {status}
    </span>
  );
}
