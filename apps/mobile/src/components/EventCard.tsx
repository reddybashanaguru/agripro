import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, shadow, typography } from '../theme';
import type { PlatformEvent } from '../api/client';
import { formatINR } from '../api/client';

const TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  'payout.completed': { emoji: '💸', label: 'Payout Completed', color: colors.success, bg: colors.successBg },
  'proof.verdict':    { emoji: '📍', label: 'GPS Proof',        color: colors.info,    bg: colors.infoBg },
  'ndvi.alert':       { emoji: '🌾', label: 'NDVI Alert',       color: colors.warning, bg: colors.warningBg },
  'sync.batch':       { emoji: '🔄', label: 'Mobile Sync',      color: colors.primary, bg: colors.primaryLight },
};

export function EventCard({ event }: { event: PlatformEvent }) {
  const cfg = TYPE_CONFIG[event.type] ?? { emoji: '📡', label: event.type, color: colors.textSecondary, bg: colors.surfaceHover };
  const d = event.data ?? {};
  const time = new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <View style={[styles.card, shadow.sm, { borderLeftColor: cfg.color }]}>
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Text style={styles.emoji}>{cfg.emoji}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {event.type === 'payout.completed' && (
          <Text style={styles.detail}>
            {formatINR(d.gross_amount)} → Farmer: {formatINR(d.farmer_gets)}
          </Text>
        )}
        {event.type === 'proof.verdict' && (
          <Text style={[styles.detail, { color: d.verdict === 'VERIFIED' ? colors.success : colors.error }]}>
            {d.verdict} · {d.accuracy_m}m accuracy
          </Text>
        )}
        {event.type === 'ndvi.alert' && (
          <Text style={styles.detail}>NDVI {d.ndvi_mean} below 0.30 · {d.source}</Text>
        )}
        {event.type === 'sync.batch' && (
          <Text style={styles.detail}>+{d.farmers_created} farmers · +{d.plots_created} plots</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
    ...shadow.sm,
  },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 },
  body: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  time: { ...typography.caption },
  detail: { ...typography.bodySmall },
});
