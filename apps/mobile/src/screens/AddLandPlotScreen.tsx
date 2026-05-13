import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import MapView, { Polygon, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { api } from '../api/client';

const DEFAULT_POLYGON = [
  { latitude: 17.400, longitude: 78.400 },
  { latitude: 17.400, longitude: 78.401 },
  { latitude: 17.401, longitude: 78.401 },
  { latitude: 17.401, longitude: 78.400 },
];

const DEFAULT_REGION = { latitude: 17.4005, longitude: 78.4005, latitudeDelta: 0.005, longitudeDelta: 0.005 };

export function AddLandPlotScreen({ route, navigation }: { route: any; navigation: any }) {
  const params = route.params ?? {};
  const [farmerId, setFarmerId] = useState(params.farmerId ?? '');
  const [plotName, setPlotName] = useState('');
  const [district, setDistrict] = useState('Hyderabad');
  const [state, setState] = useState('Telangana');
  const [loading, setLoading] = useState(false);

  const isValid = farmerId.trim().length > 10 && plotName.trim().length >= 2;

  const submit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const geojson = {
        type: 'Polygon',
        coordinates: [[
          [78.400, 17.400], [78.401, 17.400],
          [78.401, 17.401], [78.400, 17.401], [78.400, 17.400],
        ]],
      };
      const result = await api.landPlots.create({
        farmer_id: farmerId.trim(),
        plot_name: plotName.trim(),
        district: district.trim(),
        state: state.trim(),
        geojson,
      });
      Alert.alert(
        '🗺️ Land Plot Created',
        `"${plotName}" has been registered.\nArea: ${Number(result.area_acres ?? 0).toFixed(2)} acres\nID: ${result.id?.slice(0, 8)}...`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Map */}
          <View style={[styles.mapCard, shadow.md]}>
            <Text style={styles.mapLabel}>📍 Plot Boundary (WGS84)</Text>
            <MapView
              style={styles.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={DEFAULT_REGION}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Polygon
                coordinates={DEFAULT_POLYGON}
                strokeColor={colors.primary}
                fillColor={colors.primary + '30'}
                strokeWidth={2}
              />
              <Marker coordinate={DEFAULT_REGION} title="Plot Center" />
            </MapView>
            <View style={styles.mapInfo}>
              <Text style={styles.mapInfoText}>📐 Polygon: (78.400, 17.400) → (78.401, 17.401)</Text>
              <Text style={styles.mapInfoText}>📏 Area: ~2.9 acres (auto-calculated by PostGIS)</Text>
            </View>
          </View>

          {/* Form */}
          <View style={[styles.formCard, shadow.sm]}>
            <Text style={styles.fieldLabel}>FARMER SERVER ID *</Text>
            <TextInput
              style={styles.input} value={farmerId} onChangeText={setFarmerId}
              placeholder="UUID from farmer registration"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>PLOT NAME *</Text>
            <TextInput
              style={styles.input} value={plotName} onChangeText={setPlotName}
              placeholder="e.g. Kharif Field A"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>DISTRICT</Text>
                <TextInput style={styles.input} value={district} onChangeText={setDistrict} placeholderTextColor={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>STATE</Text>
                <TextInput style={styles.input} value={state} onChangeText={setState} placeholderTextColor={colors.textMuted} />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !isValid && styles.submitDisabled, shadow.sm]}
            onPress={submit} disabled={!isValid || loading} activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Register Land Plot →</Text>}
          </TouchableOpacity>
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  mapCard: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  mapLabel: { padding: spacing.md, ...typography.h3 },
  map: { height: 200, width: '100%' },
  mapInfo: { padding: spacing.md, gap: 4, backgroundColor: colors.primaryLight },
  mapInfoText: { fontSize: 12, color: colors.primaryDark },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  fieldLabel: { ...typography.label },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 15, color: colors.textPrimary, backgroundColor: colors.bg,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md + 2, alignItems: 'center' },
  submitDisabled: { backgroundColor: colors.textMuted },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
