import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { StatusBadge } from '../components/StatusBadge';
import { api, formatINR, type LandPlot } from '../api/client';
import type { FarmerData } from '../components/FarmerCard';

export function FarmerDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const farmer: FarmerData = route.params.farmer;
  const [plots, setPlots] = useState<LandPlot[]>([]);
  const [loadingPlots, setLoadingPlots] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payoutModal, setPayoutModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);

  const farmerId = farmer.serverId ?? farmer.id;

  const load = useCallback(async () => {
    if (!farmer.serverId) { setLoadingPlots(false); return; }
    try {
      const res = await api.landPlots.listByFarmer(farmerId);
      setPlots(res.plots ?? []);
    } catch { setPlots([]); }
    finally { setLoadingPlots(false); setRefreshing(false); }
  }, [farmerId]);

  useEffect(() => { load(); }, []);

  const disbursePayout = async () => {
    const gross = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(gross) || gross <= 0) { Alert.alert('Invalid amount'); return; }
    if (farmer.kycStatus !== 'VERIFIED') {
      Alert.alert('KYC Not Verified', 'This farmer cannot receive payouts until KYC is verified.'); return;
    }
    setPayoutLoading(true);
    try {
      const result = await api.payouts.create({
        farmer_id: farmerId,
        gross_amount: gross.toString(),
        currency: 'INR',
        description: `Payout for ${farmer.name}`,
      });
      const farmerGets = (gross * 0.50).toFixed(2);
      const platform = (gross * 0.25).toFixed(2);
      const agent = (gross * 0.05).toFixed(2);
      const reserve = (gross - parseFloat(farmerGets) - parseFloat(platform) - parseFloat(agent)).toFixed(2);
      setPayoutModal(false);
      setAmount('');
      Alert.alert(
        '💸 Payout Disbursed!',
        `Gross: ${formatINR(gross)}\n\n` +
        `🟢 Farmer (50%): ${formatINR(farmerGets)}\n` +
        `🔵 Platform (25%): ${formatINR(platform)}\n` +
        `🟡 Agent (5%): ${formatINR(agent)}\n` +
        `⚪ Reserve (20%): ${formatINR(reserve)}\n\n` +
        `Transaction ID: ${result.id?.slice(0, 8)}...`,
      );
    } catch (e: any) {
      setPayoutModal(false);
      Alert.alert('Payout Failed', e.message);
    } finally { setPayoutLoading(false); }
  };

  const initials = farmer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Farmer Hero Card */}
        <View style={[styles.heroCard, shadow.md]}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <Text style={styles.farmerName}>{farmer.name}</Text>
          <Text style={styles.farmerPhone}>{farmer.phone}</Text>
          <StatusBadge status={farmer.kycStatus} />
          {farmer.serverId && (
            <Text style={styles.serverId}>ID: {farmer.serverId.slice(0, 8)}...</Text>
          )}
          {!farmer.serverId && (
            <View style={styles.offlineTag}>
              <Text style={styles.offlineTagText}>⏳ Not yet synced to server</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!farmer.serverId) { Alert.alert('Sync required', 'Sync this farmer to server before disbursing.'); return; }
              setPayoutModal(true);
            }}
          >
            <Text style={styles.actionBtnText}>💸 Disburse Payout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.accent }]}
            onPress={() => navigation.navigate('GPSProof', { farmerId, plotId: plots[0]?.id })}
          >
            <Text style={styles.actionBtnText}>📍 GPS Proof</Text>
          </TouchableOpacity>
        </View>

        {/* Land Plots */}
        <Text style={styles.sectionTitle}>Land Plots ({plots.length})</Text>
        {!farmer.serverId ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Sync farmer to server to view land plots</Text>
          </View>
        ) : loadingPlots ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : plots.length === 0 ? (
          <View style={styles.emptyPlots}>
            <Text style={styles.emptyText}>🗺️  No plots registered yet</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AddPlot', { farmerId })}>
              <Text style={styles.addLink}>+ Add land plot</Text>
            </TouchableOpacity>
          </View>
        ) : (
          plots.map(plot => (
            <View key={plot.id} style={[styles.plotCard, shadow.sm]}>
              <View style={styles.plotHeader}>
                <Text style={styles.plotName}>🗺️  {plot.plot_name || 'Unnamed Plot'}</Text>
                <Text style={styles.plotArea}>{Number(plot.area_acres ?? 0).toFixed(2)} acres</Text>
              </View>
              {(plot.district || plot.state) && (
                <Text style={styles.plotLocation}>📍 {[plot.district, plot.state].filter(Boolean).join(', ')}</Text>
              )}
            </View>
          ))
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Payout Modal */}
      <Modal visible={payoutModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadow.lg]}>
            <Text style={styles.modalTitle}>💸 Disburse Payout</Text>
            <Text style={styles.modalSub}>Farmer: {farmer.name}</Text>
            <Text style={styles.fieldLabel}>GROSS AMOUNT (INR)</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="e.g. 50000"
              value={amount} onChangeText={setAmount}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {amount.length > 0 && !isNaN(parseFloat(amount)) && (
              <View style={styles.splitPreview}>
                <Text style={styles.splitTitle}>Split Preview (50/25/5/20)</Text>
                {[
                  ['👨‍🌾 Farmer (50%)', (parseFloat(amount) * 0.5)],
                  ['🏦 Platform (25%)', (parseFloat(amount) * 0.25)],
                  ['🤝 Agent (5%)', (parseFloat(amount) * 0.05)],
                  ['🛡️ Reserve (20%)', (parseFloat(amount) * 0.20)],
                ].map(([label, val]) => (
                  <View key={label as string} style={styles.splitRow}>
                    <Text style={styles.splitLabel}>{label as string}</Text>
                    <Text style={styles.splitValue}>{formatINR(val as number)}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPayoutModal(false); setAmount(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={disbursePayout} disabled={payoutLoading}>
                {payoutLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Disburse →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  heroCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg,
    alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 28, fontWeight: '700', color: colors.primary },
  farmerName: { ...typography.h1, textAlign: 'center' },
  farmerPhone: { ...typography.body, color: colors.textSecondary },
  serverId: { ...typography.caption },
  offlineTag: { backgroundColor: colors.warningBg, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  offlineTagText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', ...shadow.sm },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { ...typography.h2 },
  infoBox: { backgroundColor: colors.surfaceHover, borderRadius: radius.md, padding: spacing.md },
  infoText: { ...typography.bodySmall, textAlign: 'center' },
  emptyPlots: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyText: { ...typography.body },
  addLink: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  plotCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  plotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plotName: { ...typography.h3 },
  plotArea: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  plotLocation: { ...typography.bodySmall },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md },
  modalTitle: { ...typography.h1, textAlign: 'center' },
  modalSub: { ...typography.bodySmall, textAlign: 'center' },
  fieldLabel: { ...typography.label },
  amountInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: 24, fontWeight: '700', color: colors.textPrimary, backgroundColor: colors.bg,
  },
  splitPreview: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  splitTitle: { ...typography.label, marginBottom: spacing.xs },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  splitLabel: { ...typography.body },
  splitValue: { fontWeight: '700', color: colors.primary },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', ...shadow.sm },
  confirmText: { color: '#fff', fontWeight: '700' },
});
