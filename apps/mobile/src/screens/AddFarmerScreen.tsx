import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { createFarmerViaSync, type KYCStatus } from '../api/client';

const KYC_OPTIONS: KYCStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];
const KYC_COLOR: Record<KYCStatus, string> = {
  VERIFIED: colors.success, PENDING: colors.warning, REJECTED: colors.error,
};

export function AddFarmerScreen({ navigation }: { navigation: any }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [kyc, setKyc] = useState<KYCStatus>('VERIFIED');
  const [loading, setLoading] = useState(false);

  const isValid = name.trim().length >= 2 && phone.trim().length >= 10;

  const submit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const result = await createFarmerViaSync(localId, name.trim(), phone.trim(), kyc);
      const serverId = result.server_ids?.farmers?.[localId];
      Alert.alert(
        '✅ Farmer Registered',
        `${name} has been registered successfully.\n\nServer ID: ${serverId?.slice(0, 8)}...`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>👤</Text>
            <Text style={styles.heroTitle}>Register Farmer</Text>
            <Text style={styles.heroSub}>Data is saved offline and synced to server</Text>
          </View>

          {/* Form */}
          <View style={[styles.card, shadow.sm]}>
            <Text style={styles.fieldLabel}>FULL NAME *</Text>
            <TextInput
              style={[styles.input, name.length > 0 && !name.trim() && styles.inputError]}
              placeholder="e.g. Ravi Kumar"
              value={name} onChangeText={setName}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>PHONE NUMBER *</Text>
            <TextInput
              style={styles.input}
              placeholder="+91 98765 43210"
              value={phone} onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>KYC STATUS</Text>
            <View style={styles.kycRow}>
              {KYC_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.kycChip, kyc === opt && { backgroundColor: KYC_COLOR[opt], borderColor: KYC_COLOR[opt] }]}
                  onPress={() => setKyc(opt)}
                >
                  <Text style={[styles.kycText, kyc === opt && { color: '#fff' }]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.infoBox, { backgroundColor: KYC_COLOR[kyc] + '15', borderColor: KYC_COLOR[kyc] + '40' }]}>
              <Text style={[styles.infoText, { color: KYC_COLOR[kyc] }]}>
                {kyc === 'VERIFIED' && '✓ This farmer can receive payouts immediately'}
                {kyc === 'PENDING' && '⏳ KYC verification required before payouts'}
                {kyc === 'REJECTED' && '✗ Farmer cannot receive payouts in this status'}
              </Text>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, !isValid && styles.submitDisabled]}
            onPress={submit}
            disabled={!isValid || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Register Farmer →</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            📶 Works offline — data syncs automatically when connected
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  heroEmoji: { fontSize: 48 },
  heroTitle: { ...typography.h1 },
  heroSub: { ...typography.bodySmall, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: 16, color: colors.textPrimary, backgroundColor: colors.bg,
  },
  inputError: { borderColor: colors.error },
  kycRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  kycChip: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm,
    alignItems: 'center', backgroundColor: colors.bg,
  },
  kycText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  infoBox: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  infoText: { fontSize: 13, fontWeight: '500' },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: spacing.md + 2, alignItems: 'center', ...shadow.md,
  },
  submitDisabled: { backgroundColor: colors.textMuted },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  note: { textAlign: 'center', ...typography.caption, paddingBottom: spacing.xl },
});
