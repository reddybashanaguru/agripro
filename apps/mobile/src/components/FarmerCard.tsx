import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { StatusBadge } from './StatusBadge';

export interface FarmerData {
  id: string; serverId?: string; name: string;
  phone: string; kycStatus: string; isOffline?: boolean;
}

interface Props { farmer: FarmerData; onPress: () => void; }

export function FarmerCard({ farmer, onPress }: Props) {
  const initials = farmer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <TouchableOpacity style={[styles.card, shadow.sm]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{farmer.name}</Text>
        <Text style={styles.phone}>{farmer.phone}</Text>
        {farmer.isOffline && <Text style={styles.offline}>⏳ Pending sync</Text>}
      </View>
      <StatusBadge status={farmer.kycStatus} size="sm" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 16, fontWeight: '700', color: colors.primary },
  info: { flex: 1 },
  name: { ...typography.h3, marginBottom: 2 },
  phone: { ...typography.bodySmall },
  offline: { fontSize: 11, color: colors.warning, marginTop: 2 },
});
