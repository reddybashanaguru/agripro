import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Animated, ScrollView, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { api, type Verdict } from '../api/client';

type GPSState = 'acquiring' | 'ready' | 'submitting' | 'result';

interface GPSCoords { latitude: number; longitude: number; accuracy: number; }

export function GPSProofScreen({ route, navigation }: { route: any; navigation: any }) {
  const params = route.params ?? {};
  const [gpsState, setGpsState] = useState<GPSState>('acquiring');
  const [coords, setCoords] = useState<GPSCoords | null>(null);
  const [farmerId, setFarmerId] = useState(params.farmerId ?? '');
  const [plotId, setPlotId] = useState(params.plotId ?? '');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [spoofReason, setSpoofReason] = useState('');
  const [error, setError] = useState('');

  const pulse = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0)).current;

  // Simulate GPS acquisition
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.3, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ])).start();

    const timer = setTimeout(() => {
      setCoords({ latitude: 17.4005, longitude: 78.4005, accuracy: 4.2 });
      setGpsState('ready');
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const animateResult = () => {
    Animated.spring(resultScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }).start();
  };

  const submit = async () => {
    if (!farmerId.trim() || !plotId.trim()) {
      Alert.alert('Missing Fields', 'Please enter both Farmer ID and Plot ID.');
      return;
    }
    if (!coords) { Alert.alert('GPS not ready'); return; }

    setGpsState('submitting');
    setError('');

    const photoHash = `mobile_proof_${Date.now()}_${Math.random().toString(36).slice(2, 34).padEnd(32, '0')}`;

    try {
      const result = await api.proof.submit(plotId.trim(), {
        farmer_id: farmerId.trim(),
        longitude: coords.longitude,
        latitude: coords.latitude,
        accuracy_m: coords.accuracy,
        photo_hash: photoHash,
      });
      setVerdict(result.verdict);
      setSpoofReason(result.spoof_reason ?? '');
      setGpsState('result');
      animateResult();
    } catch (e: any) {
      setError(e.message);
      setGpsState('ready');
    }
  };

  const reset = () => {
    setVerdict(null); setSpoofReason(''); setGpsState('ready');
    resultScale.setValue(0);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* GPS Indicator */}
        <View style={styles.gpsContainer}>
          <Animated.View style={[styles.gpsPulse, gpsState === 'acquiring' && { transform: [{ scale: pulse }] },
            { backgroundColor: gpsState === 'ready' ? colors.success + '20' : colors.primary + '20' }]}>
            <View style={[styles.gpsDot, { backgroundColor: gpsState === 'ready' ? colors.success : colors.primary }]}>
              <Text style={styles.gpsEmoji}>{gpsState === 'acquiring' ? '📡' : gpsState === 'submitting' ? '⏳' : '📍'}</Text>
            </View>
          </Animated.View>
          <Text style={styles.gpsStatus}>
            {gpsState === 'acquiring' && 'Acquiring GPS signal...'}
            {gpsState === 'ready' && '✓ GPS signal acquired'}
            {gpsState === 'submitting' && 'Verifying with server...'}
            {gpsState === 'result' && (verdict === 'VERIFIED' ? '✓ Field presence confirmed!' : '⚠ Verification failed')}
          </Text>
          {coords && (
            <View style={styles.coordsCard}>
              <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>Latitude</Text>
                <Text style={styles.coordValue}>{coords.latitude.toFixed(6)}°</Text>
              </View>
              <View style={styles.coordDivider} />
              <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>Longitude</Text>
                <Text style={styles.coordValue}>{coords.longitude.toFixed(6)}°</Text>
              </View>
              <View style={styles.coordDivider} />
              <View style={styles.coordRow}>
                <Text style={styles.coordLabel}>Accuracy</Text>
                <Text style={[styles.coordValue, { color: coords.accuracy < 10 ? colors.success : colors.warning }]}>
                  ±{coords.accuracy}m
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Result View */}
        {gpsState === 'result' && verdict && (
          <Animated.View style={[styles.resultCard, { transform: [{ scale: resultScale }] },
            { borderColor: verdict === 'VERIFIED' ? colors.success : colors.error,
              backgroundColor: verdict === 'VERIFIED' ? colors.successBg : colors.errorBg }]}>
            <Text style={styles.resultEmoji}>{verdict === 'VERIFIED' ? '✅' : '🚫'}</Text>
            <Text style={[styles.resultVerdict, { color: verdict === 'VERIFIED' ? colors.success : colors.error }]}>
              {verdict}
            </Text>
            {spoofReason ? <Text style={styles.resultReason}>{spoofReason}</Text> : null}
            <TouchableOpacity style={[styles.resetBtn, { borderColor: verdict === 'VERIFIED' ? colors.success : colors.error }]} onPress={reset}>
              <Text style={[styles.resetText, { color: verdict === 'VERIFIED' ? colors.success : colors.error }]}>Submit Another</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Form */}
        {(gpsState === 'ready' || gpsState === 'submitting') && (
          <View style={[styles.formCard, shadow.sm]}>
            <Text style={styles.sectionTitle}>Field Details</Text>

            <Text style={styles.fieldLabel}>FARMER SERVER ID</Text>
            <TextInput
              style={styles.input} value={farmerId}
              onChangeText={setFarmerId}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>PLOT SERVER ID</Text>
            <TextInput
              style={styles.input} value={plotId}
              onChangeText={setPlotId}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitBtn, gpsState === 'submitting' && styles.submitLoading]}
              onPress={submit}
              disabled={gpsState === 'submitting' || !coords}
              activeOpacity={0.8}
            >
              {gpsState === 'submitting' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>📸 Capture & Submit Proof</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.note}>A unique photo hash will be generated and submitted with your GPS coordinates</Text>
          </View>
        )}

        {/* Anti-spoof info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>🛡️ Anti-Spoofing Active</Text>
          <Text style={styles.infoItem}>• Zero or negative accuracy → SPOOFED</Text>
          <Text style={styles.infoItem}>• Sub-meter accuracy → SPOOFED</Text>
          <Text style={styles.infoItem}>• Duplicate photo hash → SPOOFED</Text>
          <Text style={styles.infoItem}>• Point outside plot boundary → REJECTED</Text>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, alignItems: 'stretch' },
  gpsContainer: { alignItems: 'center', gap: spacing.md },
  gpsPulse: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  gpsDot: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  gpsEmoji: { fontSize: 36 },
  gpsStatus: { ...typography.h3, textAlign: 'center' },
  coordsCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    width: '100%', borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  coordRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  coordLabel: { ...typography.bodySmall },
  coordValue: { fontWeight: '700', fontSize: 14, color: colors.textPrimary },
  coordDivider: { height: 1, backgroundColor: colors.border },
  resultCard: {
    borderRadius: radius.xl, borderWidth: 2, padding: spacing.xl,
    alignItems: 'center', gap: spacing.md,
  },
  resultEmoji: { fontSize: 64 },
  resultVerdict: { fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  resultReason: { ...typography.body, textAlign: 'center', color: colors.textSecondary },
  resetBtn: { borderWidth: 2, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  resetText: { fontWeight: '700', fontSize: 14 },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { ...typography.h2, marginBottom: spacing.sm },
  fieldLabel: { ...typography.label },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 14, color: colors.textPrimary, backgroundColor: colors.bg, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md },
  errorText: { color: colors.error, fontSize: 13 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', ...shadow.sm },
  submitLoading: { backgroundColor: colors.textMuted },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  note: { ...typography.caption, textAlign: 'center' },
  infoBox: { backgroundColor: colors.infoBg, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: colors.info, marginBottom: 4 },
  infoItem: { fontSize: 12, color: colors.info },
});
