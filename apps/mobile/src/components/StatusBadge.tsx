import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, typography } from '../theme';

type Variant = 'verified' | 'spoofed' | 'rejected' | 'pending' | 'completed' | 'failed' | 'info';

const MAP: Record<string, Variant> = {
  VERIFIED: 'verified', COMPLETED: 'completed',
  SPOOFED: 'spoofed', FAILED: 'failed',
  REJECTED: 'rejected', PENDING: 'pending',
};

const STYLES: Record<Variant, { bg: string; text: string; dot: string }> = {
  verified:  { bg: colors.successBg,  text: colors.success,  dot: colors.success },
  completed: { bg: colors.successBg,  text: colors.success,  dot: colors.success },
  spoofed:   { bg: colors.spoofedBg,  text: colors.spoofed,  dot: colors.spoofed },
  rejected:  { bg: colors.errorBg,    text: colors.error,    dot: colors.error },
  pending:   { bg: colors.warningBg,  text: colors.warning,  dot: colors.warning },
  failed:    { bg: colors.errorBg,    text: colors.error,    dot: colors.error },
  info:      { bg: colors.infoBg,     text: colors.info,     dot: colors.info },
};

interface Props { status: string; size?: 'sm' | 'md'; }

export function StatusBadge({ status, size = 'md' }: Props) {
  const variant: Variant = MAP[status?.toUpperCase()] ?? 'info';
  const s = STYLES[variant];
  const isSmall = size === 'sm';
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, paddingHorizontal: isSmall ? 6 : 10, paddingVertical: isSmall ? 2 : 4 }]}>
      <View style={[styles.dot, { backgroundColor: s.dot, width: isSmall ? 5 : 6, height: isSmall ? 5 : 6 }]} />
      <Text style={[styles.text, { color: s.text, fontSize: isSmall ? 10 : 12 }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  dot: { borderRadius: radius.full },
  text: { fontWeight: '600', letterSpacing: 0.3 },
});
