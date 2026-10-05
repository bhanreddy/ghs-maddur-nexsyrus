import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from '@/src/utils/haptics';
import { visitorService } from '@/src/services/visitorService';

export default function GatekeeperScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const isLockedRef = useRef(false);

  useEffect(() => {
    isLockedRef.current = false;
  }, []);

  const handleProcessCode = useCallback(async (code: string) => {
    if (isLockedRef.current || processing) return;
    isLockedRef.current = true;
    setProcessing(true);
    setErrorMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const cleanCode = code.trim();

    // Check if it's a student pickup pass
    if (cleanCode.startsWith('P-') || cleanCode.startsWith('pkup_') || cleanCode.startsWith('PK-') || cleanCode.startsWith('pkpass_')) {
      router.replace({
        pathname: '/gatekeeper/pickup',
        params: { code: cleanCode },
      } as any);
      return;
    }

    // Check if it's a paperless event QR pass
    if (cleanCode.startsWith('EV-') || cleanCode.startsWith('evpass_')) {
      router.replace({
        pathname: '/gatekeeper/event-verify',
        params: { token: cleanCode },
      } as any);
      return;
    }

    // Otherwise validate visitor pass
    try {
      const validation = await visitorService.validateVisitorPass(cleanCode);
      Haptics.notificationAsync(
        validation.isValid
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );

      router.replace({
        pathname: '/gatekeeper/verify',
        params: {
          token: cleanCode,
          validation: JSON.stringify(validation),
        },
      } as any);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(err?.message || 'Failed to validate pass');
      setProcessing(false);
      setTimeout(() => {
        isLockedRef.current = false;
      }, 2000);
    }
  }, [processing, router]);

  const onBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (result.data) {
        handleProcessCode(result.data);
      }
    },
    [handleProcessCode]
  );

  if (!permission) {
    return (
      <View style={styles.centerRoot}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.permissionText}>Initializing Camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerRoot}>
        <Ionicons name="camera-outline" size={54} color="#EF4444" />
        <Text style={styles.deniedTitle}>Camera Permission Required</Text>
        <Text style={styles.deniedSub}>
          Gate scanning requires camera access to scan visitor and student pickup QR codes.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.manualEntryBtn}
          onPress={() => setShowManualInput(true)}
        >
          <Text style={styles.manualEntryText}>Enter Pass Code Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TourTarget id="screen.gatekeeper-scanner.overview" native><TourTarget id="screen.gatekeeper-scanner.workspace" native><View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Live Camera View */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
        onBarcodeScanned={processing ? undefined : onBarcodeScanned}
      />

      {/* Dimmed Scrims */}
      <View style={styles.scrimTop} />
      <View style={styles.scrimBottom} />

      {/* Controls Overlay */}
      <SafeAreaView style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>

          <View style={styles.hudBadge}>
            <Ionicons name="scan" size={14} color="#10B981" />
            <Text style={styles.hudBadgeText}>GATE QR SCANNER</Text>
          </View>

          <Pressable
            style={[styles.circleBtn, torch && styles.torchActive]}
            onPress={() => setTorch((v) => !v)}
          >
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsWrap}>
          <Text style={styles.scanTitle}>Align Pass QR in Frame</Text>
          <Text style={styles.scanSub}>Point at visitor phone pass or printed permit</Text>
        </View>

        {/* Targeting Reticle Frame */}
        <View style={styles.frameContainer}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            {processing && (
              <View style={styles.processingBox}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.processingText}>Verifying Pass with Gate System...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Error message card */}
        {errorMsg && (
          <View style={styles.errorAlert}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorAlertText}>{errorMsg}</Text>
          </View>
        )}

        {/* Bottom Bar: Manual Code Entry */}
        <View style={styles.bottomBar}>
          {showManualInput ? (
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.codeTextInput}
                placeholder="Enter Code (e.g. V-ABC-123)"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                value={manualCode}
                onChangeText={setManualCode}
              />
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => handleProcessCode(manualCode)}
                disabled={processing || !manualCode.trim()}
              >
                <Text style={styles.verifyBtnText}>Verify</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelManual}
                onPress={() => setShowManualInput(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.toggleManualBtn}
              onPress={() => setShowManualInput(true)}
            >
              <Ionicons name="keypad-outline" size={18} color="#FFFFFF" />
              <Text style={styles.toggleManualText}>Manual Code Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View></TourTarget></TourTarget>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  centerRoot: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionText: { color: '#94A3B8', marginTop: 12, fontSize: 14 },
  deniedTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 16 },
  deniedSub: { color: '#94A3B8', textAlign: 'center', fontSize: 13, marginTop: 8, lineHeight: 18 },
  grantBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  grantBtnText: { color: '#FFFFFF', fontWeight: '700' },
  manualEntryBtn: { marginTop: 16 },
  manualEntryText: { color: '#38BDF8', fontWeight: '600' },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchActive: { backgroundColor: '#F59E0B' },
  hudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  hudBadgeText: { color: '#10B981', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  instructionsWrap: { alignItems: 'center', marginTop: 10 },
  scanTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  scanSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  frameContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 260,
    height: 260,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#10B981',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  processingBox: {
    backgroundColor: 'rgba(15,23,42,0.92)',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  processingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.9)',
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 16,
  },
  errorAlertText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', flex: 1 },
  bottomBar: {
    paddingBottom: 24,
    alignItems: 'center',
  },
  toggleManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  toggleManualText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  codeTextInput: {
    flex: 1,
    height: 48,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#334155',
  },
  verifyBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 18,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnText: { color: '#FFFFFF', fontWeight: '800' },
  cancelManual: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
