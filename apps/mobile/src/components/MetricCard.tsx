import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, shadow, typography } from '../theme';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  emoji: string;
  color?: string;
}

export function MetricCard({ label, value, sub, emoji, color = colors.primary }: Props) {
  return (
    <View style={[styles.card, shadow.sm]}>
      <View style={[styles.icon, { backgroundColor: color + '18' }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  value: { fontSize: 22, fontWeight: '700' },
  label: { ...typography.caption, textAlign: 'center' },
  sub: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
});
