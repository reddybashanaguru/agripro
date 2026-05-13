import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, shadow, typography } from '../theme';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { FarmerCard, type FarmerData } from '../components/FarmerCard';
import { api } from '../api/client';

export function FarmersScreen({ navigation }: { navigation: any }) {
  const [farmers, setFarmers] = useState<FarmerData[]>([]);
  const [filtered, setFiltered] = useState<FarmerData[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.sync.pull(0);
      const farmerList: FarmerData[] = (data?.changes?.farmers?.created ?? []).map((f: any) => ({
        id: f.id, serverId: f.server_id, name: f.name,
        phone: f.phone, kycStatus: f.kyc_status ?? 'PENDING',
      }));
      setFarmers(farmerList);
      setFiltered(farmerList);
    } catch {
      setFarmers([]); setFiltered([]);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const search = (q: string) => {
    setQuery(q);
    const lower = q.toLowerCase();
    setFiltered(farmers.filter(f =>
      f.name.toLowerCase().includes(lower) || f.phone.includes(lower)
    ));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SyncStatusBar />
      <View style={styles.header}>
        <Text style={styles.title}>Farmers</Text>
        <Text style={styles.count}>{farmers.length} registered</Text>
      </View>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={search}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => search('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={f => f.id}
          renderItem={({ item }) => (
            <FarmerCard farmer={item} onPress={() => navigation.navigate('FarmerDetail', { farmer: item })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyText}>{query ? 'No matches found' : 'No farmers yet'}</Text>
              {!query && <Text style={styles.emptySub}>Tap + to register your first farmer</Text>}
            </View>
          }
        />
      )}
      <TouchableOpacity style={[styles.fab, shadow.lg]} onPress={() => navigation.navigate('AddFarmer')}>
        <Text style={styles.fabText}>+ Add Farmer</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { ...typography.h1 },
  count: { ...typography.bodySmall },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, margin: spacing.lg, marginTop: 0,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: spacing.md },
  clearBtn: { fontSize: 14, color: colors.textMuted, padding: 4 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyText: { ...typography.h3 },
  emptySub: { ...typography.bodySmall, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: spacing.xl, right: spacing.lg,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    flexDirection: 'row', alignItems: 'center',
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
