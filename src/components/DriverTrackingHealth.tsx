import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, View, Linking, TouchableOpacity } from 'react-native';
import { getTrackingHealth, subscribeTrackingHealth } from '../services/driverLocationTask';
export default function DriverTrackingHealth() {
  const health = useSyncExternalStore(subscribeTrackingHealth, getTrackingHealth);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (health.mode === 'stopped') return null;
  const age = health.lastUploadAt ? Math.floor((now - health.lastUploadAt) / 1000) : null;
  const stale = age == null || age > 120;
  return <View accessibilityLiveRegion="polite" style={{
    padding: 12,
    backgroundColor: stale ? '#FEF3C7' : '#DCFCE7'
  }}>
    <Text style={{
      color: '#172033'
    }}>{health.message}{age != null ? ` · Last upload ${age}s ago` : ''}{health.queued ? ` · ${health.queued} queued` : ''}</Text>
    {['permission_denied', 'foreground_only'].includes(health.mode) && <TouchableOpacity onPress={() => void Linking.openSettings()}><Text style={{
        color: '#1D4ED8',
        paddingTop: 8
      }}>Open location settings</Text></TouchableOpacity>}
  </View>;
}
