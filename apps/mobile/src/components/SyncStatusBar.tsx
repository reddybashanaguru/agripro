import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing } from '../theme';
import { checkHealth } from '../api/client';

type Status = 'connected' | 'offline' | 'checking';

export function SyncStatusBar() {
  const [status, setStatus] = useState<Status>('checking');
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const check = async () => {
      const ok = await checkHealth();
      setStatus(ok ? 'connected' : 'offline');
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'checking') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.setValue(1);
    }
  }, [status]);

  if (status === 'connected') return null;

  const bg = status === 'offline' ? colors.error : colors.warning;
  const label = status === 'offline' ? '● Offline — changes saved locally' : '◌ Connecting to Finagra server...';

  return (
    <Animated.View style={[styles.bar, { backgroundColor: bg, opacity: status === 'checking' ? pulse : 1 }]}>
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 6, paddingHorizontal: spacing.md, alignItems: 'center' },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
