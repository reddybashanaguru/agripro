import type { Metadata } from "next";
import {
  Banknote,
  Users,
  MapPin,
  AlertTriangle,
  Camera,
  TrendingUp,
} from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { LedgerBalanceWidget } from "@/components/LedgerBalanceWidget";
import { TransactionTable } from "@/components/TransactionTable";
import { getLedgerBalance, getTransactions, getPlatformMetrics } from "@/lib/api";
import { formatINR } from "@/lib/types";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [balance, txnResp, metrics] = await Promise.allSettled([
    getLedgerBalance(),
    getTransactions(10, 0),
    getPlatformMetrics(),
  ]);

  const balanceData =
    balance.status === "fulfilled" ? balance.value : null;
  const transactions =
    txnResp.status === "fulfilled" ? txnResp.value.transactions : [];
  const metricsData =
    metrics.status === "fulfilled" ? metrics.value : null;

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Investor Command Center
        </h1>
        <p className="mt-1 text-gray-600">
          Real-time view of the Finagra Unity AgTech platform
        </p>
      </div>

      {/* KPI grid */}
      <section aria-labelledby="kpi-heading" className="mb-8">
        <h2 id="kpi-heading" className="sr-only">
          Key Performance Indicators
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            title="Total Disbursed"
            value={
              metricsData
                ? formatINR(metricsData.total_disbursed)
                : "—"
            }
            icon={<Banknote className="h-5 w-5" />}
            variant="success"
            aria-label="Total amount disbursed to farmers"
          />
          <MetricCard
            title="Farmers"
            value={
              metricsData
                ? metricsData.farmer_count.toLocaleString("en-IN")
                : "—"
            }
            icon={<Users className="h-5 w-5" />}
            aria-label="Number of registered farmers"
          />
          <MetricCard
            title="Land Plots"
            value={
              metricsData
                ? metricsData.plot_count.toLocaleString("en-IN")
                : "—"
            }
            icon={<MapPin className="h-5 w-5" />}
            aria-label="Number of registered land plots"
          />
          <MetricCard
            title="Transactions"
            value={
              metricsData
                ? metricsData.transaction_count.toLocaleString("en-IN")
                : "—"
            }
            icon={<TrendingUp className="h-5 w-5" />}
            aria-label="Total number of payout transactions"
          />
          <MetricCard
            title="NDVI Alerts"
            value={
              metricsData
                ? metricsData.total_ndvi_alerts.toLocaleString("en-IN")
                : "—"
            }
            icon={<AlertTriangle className="h-5 w-5" />}
            variant={
              metricsData && metricsData.total_ndvi_alerts > 0
                ? "warning"
                : "default"
            }
            subtitle="Plots with NDVI < 0.3"
            aria-label={`${metricsData?.total_ndvi_alerts ?? 0} NDVI alerts: plots with vegetation index below threshold`}
          />
          <MetricCard
            title="GPS Proofs"
            value={
              metricsData
                ? metricsData.total_proof_records.toLocaleString("en-IN")
                : "—"
            }
            icon={<Camera className="h-5 w-5" />}
            aria-label="Total field GPS proof-of-action records"
          />
        </div>
      </section>

      {/* Ledger balance + recent txns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {balanceData ? (
            <LedgerBalanceWidget balance={balanceData} />
          ) : (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-6"
              role="alert"
            >
              <p className="font-semibold text-red-800">
                Ledger balance unavailable
              </p>
              <p className="mt-1 text-sm text-red-600">
                Check backend connectivity.
              </p>
            </div>
          )}
        </div>

        <section
          className="lg:col-span-3"
          aria-labelledby="recent-txns-heading"
        >
          <h2
            id="recent-txns-heading"
            className="mb-4 text-lg font-semibold text-gray-900"
          >
            Recent Transactions
          </h2>
          <TransactionTable
            transactions={transactions}
            caption="10 most recent payout transactions"
          />
        </section>
      </div>
    </>
  );
}
