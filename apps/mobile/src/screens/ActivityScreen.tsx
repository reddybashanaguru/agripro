import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { EventCard } from '../components/EventCard';
import type { PlatformEvent } from '../api/client';

type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

const STATUS_COLOR: Record<ConnStatus, string> = {
  connecting: colors.warning, connected: colors.success,
  reconnecting: colors.warning, error: colors.error,
};

export function ActivityScreen() {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const reconnectTimer = useRef<any>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const connect = useCallback(() => {
    setStatus('connecting');
    const controller = new AbortController();

    const readStream = async () => {
      try {
        const resp = await fetch('http://localhost:8888/api/v1/events/stream', {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!resp.ok || !resp.body) throw new Error('Stream unavailable');
        setStatus('connected');

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const payload = JSON.parse(line.slice(5).trim()) as PlatformEvent;
                if (payload.type && payload.type !== 'connected') {
                  setEvents(prev => [payload, ...prev].slice(0, 30));
                }
              } catch {}
            }
          }
        }
        throw new Error('Stream ended');
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        setStatus('reconnecting');
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    readStream();
    return () => { controller.abort(); clearTimeout(reconnectTimer.current); };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start();
    } else { pulse.setValue(1); }
  }, [status]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Live Activity</Text>
          <Text style={styles.subtitle}>{events.length} events received</Text>
        </View>
        <Animated.View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[status] + '20', opacity: status === 'connected' ? 1 : pulse }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
          <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>{status}</Text>
        </Animated.View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { emoji: '💸', label: 'Payout', color: colors.success },
          { emoji: '📍', label: 'GPS', color: colors.info },
          { emoji: '🌾', label: 'NDVI', color: colors.warning },
          { emoji: '🔄', label: 'Sync', color: colors.primary },
        ].map(item => (
          <View key={item.label} style={styles.legendItem}>
            <Text style={styles.legendEmoji}>{item.emoji}</Text>
            <Text style={[styles.legendLabel, { color: item.color }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Events */}
      {events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📡</Text>
          <Text style={styles.emptyTitle}>Listening for events...</Text>
          <Text style={styles.emptySub}>
            {status === 'connected'
              ? 'Perform an action (payout, GPS proof, NDVI) to see events here'
              : 'Connecting to event stream...'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.h1 },
  subtitle: { ...typography.caption },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  legend: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  legendItem: { alignItems: 'center', gap: 2 },
  legendEmoji: { fontSize: 16 },
  legendLabel: { fontSize: 10, fontWeight: '600' },
  list: { padding: spacing.lg, paddingBottom: 100 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: 'center' },
  emptySub: { ...typography.bodySmall, textAlign: 'center' },
});
