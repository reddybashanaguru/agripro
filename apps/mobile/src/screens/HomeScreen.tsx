import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { api, formatINR, type PlatformMetrics, type Transaction } from '../api/client';

export function HomeScreen({ navigation }: { navigation: any }) {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const [m, t] = await Promise.allSettled([api.metrics(), api.payouts.list(5)]);
      if (m.status === 'fulfilled') setMetrics(m.value);
      if (t.status === 'fulfilled') setTxns(t.value.transactions ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const quickActions = [
    { emoji: '👤', label: 'Add Farmer', screen: 'AddFarmer', color: colors.primary },
    { emoji: '🗺️', label: 'Add Plot', screen: 'AddPlot', color: colors.accent },
    { emoji: '📍', label: 'GPS Proof', screen: 'GPSProof', color: colors.warning },
    { emoji: '📡', label: 'Live Events', screen: 'Activity', color: colors.success },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SyncStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Finagra Unity</Text>
          <Text style={styles.headerTitle}>Investor Command Center</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={() => load(true)}>
          <Text style={styles.syncBtnText}>⟳ Sync</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Metrics Grid */}
        <Text style={styles.sectionTitle}>Platform Overview</Text>
        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.metricsRow}>
              <MetricCard label="Farmers" value={metrics?.farmer_count ?? 0} emoji="👥" color={colors.primary} />
              <MetricCard label="Land Plots" value={metrics?.plot_count ?? 0} emoji="🗺️" color={colors.accent} />
              <MetricCard label="Transactions" value={metrics?.transaction_count ?? 0} emoji="💰" color={colors.success} />
            </View>
            <View style={[styles.metricsRow, { marginTop: spacing.sm }]}>
              <MetricCard label="GPS Proofs" value={metrics?.total_proof_records ?? 0} emoji="📍" color={colors.info} />
              <MetricCard label="NDVI Alerts" value={metrics?.total_ndvi_alerts ?? 0} emoji="🌾" color={colors.warning} />
              <MetricCard
                label="Disbursed"
                value={metrics?.total_disbursed ? formatINR(metrics.total_disbursed) : '₹0'}
                emoji="📊"
                color={colors.primaryDark}
              />
            </View>
          </>
        )}

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map(a => (
            <TouchableOpacity
              key={a.screen}
              style={[styles.actionBtn, { borderColor: a.color + '40' }]}
              onPress={() => navigation.navigate(a.screen)}
              activeOpacity={0.75}
            >
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={[styles.actionLabel, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Payouts</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {txns.length === 0 && !loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>💸</Text>
            <Text style={styles.emptyText}>No payouts yet</Text>
            <Text style={styles.emptySub}>Add a farmer and disburse the first payout</Text>
          </View>
        ) : (
          txns.map(txn => (
            <View key={txn.id} style={[styles.txnRow, shadow.sm]}>
              <View style={styles.txnLeft}>
                <Text style={styles.txnAmount}>{formatINR(txn.gross_amount)}</Text>
                <Text style={styles.txnDesc} numberOfLines={1}>{txn.description || 'Payout'}</Text>
              </View>
              <View style={styles.txnRight}>
                <StatusBadge status={txn.status} size="sm" />
                <Text style={styles.txnDate}>
                  {new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
            </View>
          ))
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  header: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm, paddingBottom: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },
  syncBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  syncBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  seeAll: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  loadingWrap: { height: 120, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md },
  errorText: { color: colors.error, fontWeight: '500' },
  metricsRow: { flexDirection: 'row', gap: spacing.sm },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionBtn: {
    width: '47%', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', gap: spacing.xs,
    borderWidth: 1.5, ...shadow.sm,
  },
  actionEmoji: { fontSize: 28 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  txnRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  txnLeft: { flex: 1 },
  txnAmount: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  txnDesc: { ...typography.bodySmall, marginTop: 2 },
  txnRight: { alignItems: 'flex-end', gap: 4 },
  txnDate: { ...typography.caption },
  emptyState: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyEmoji: { fontSize: 40 },
  emptyText: { ...typography.h3 },
  emptySub: { ...typography.bodySmall, textAlign: 'center' },
});
