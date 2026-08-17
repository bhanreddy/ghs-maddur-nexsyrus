import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePaymentBanner } from '../hooks/usePaymentBanner';

const DEFAULT_REASON = 'When convenient, please review your subscription details. Thank you for being with NexSyrus.';

export default function PaymentDueBanner() {
  const { enabled, reason } = usePaymentBanner();
  const router = useRouter();

  if (!enabled) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Ionicons name="warning-outline" size={18} color="#B45309" />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>A gentle subscription reminder</Text>
        <Text style={styles.message}>{reason?.trim() || DEFAULT_REASON}</Text>
        <TouchableOpacity style={styles.action} onPress={() => router.push('/admin/subscription' as any)}>
          <Text style={styles.actionText}>View details</Text>
          <Ionicons name="arrow-forward" size={13} color="#92400E" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    marginBottom: 18,
    borderRadius: 16,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },
  message: {
    color: '#7C2D12',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  action: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  actionText: { color: '#92400E', fontSize: 11, fontWeight: '800' },
});
