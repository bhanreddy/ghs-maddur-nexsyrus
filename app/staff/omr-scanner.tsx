import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/src/utils/haptics';
import { omrService, OmrExam, OmrScanResult } from '@/src/services/omrService';
import { omrOfflineQueue } from '@/src/services/omrOfflineQueue';
import { decodeOmrQrPayload } from '@/src/utils/omrQr';
import { APIError } from '@/src/services/apiClient';
import { useTheme } from '@/src/hooks/useTheme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function StaffOmrScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ examId?: string; batchId?: string }>();
  const { theme } = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [torch, setTorch] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [exams, setExams] = useState<OmrExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(params.examId || '');
  const [batchMode, setBatchMode] = useState<boolean>(true);
  const [batchCount, setBatchCount] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(0);

  const [guidanceMsg, setGuidanceMsg] = useState<string>('Align OMR Sheet inside the markers');
  const [guidanceType, setGuidanceType] = useState<'info' | 'success' | 'warning'>('info');
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string>(params.batchId || '');
  const detectedQrRef = useRef<{ sid: string; eid: string; raw: string; at: number } | null>(null);
  const lastCapturedSheetRef = useRef<string>('');
  const autoCaptureTimerRef = useRef<any>(null);
  const captureLockRef = useRef(false);

  // Preview / Verification Modal after capture
  const [previewScan, setPreviewScan] = useState<OmrScanResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const autoNextTimerRef = useRef<any>(null);

  // Load active exams
  useEffect(() => {
    omrService.getExams().then((res) => {
      const examsList = res.data || [];
      setExams(examsList);
      if (!selectedExamId && examsList.length > 0) {
        setSelectedExamId(examsList[0].id);
      }
    }).catch((err) => {
      console.warn('Failed to load OMR exams:', err);
    });

    const unsubscribe = omrOfflineQueue.addListener((count) => {
      setOfflinePendingCount(count);
    });
    omrOfflineQueue.getQueueCount().then(setOfflinePendingCount);

    return () => {
      unsubscribe();
      if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    };
  }, []);

  // Real-time QR Code scanning for instant sheet identification
  const onBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (!result.data || isCapturing || showPreviewModal) return;
    const payload = decodeOmrQrPayload(result.data);
    if (!payload) {
      setGuidanceMsg('Align sheet');
      setGuidanceType('info');
      return;
    }
    if (selectedExamId && payload.examId !== selectedExamId) {
      setGuidanceMsg('This sheet belongs to a different exam');
      setGuidanceType('warning');
      detectedQrRef.current = null;
      return;
    }
    detectedQrRef.current = { sid: payload.sheetId, eid: payload.examId, raw: result.data, at: Date.now() };
    if (lastCapturedSheetRef.current === payload.sheetId) {
      setGuidanceMsg('Sheet already captured. Present the next sheet.');
      setGuidanceType('info');
      return;
    }
    setGuidanceMsg('Sheet detected. Hold steady');
    setGuidanceType('success');
  }, [isCapturing, selectedExamId, showPreviewModal]);

  // Handle Capture Action
  const handleCapture = useCallback(async (opts?: { replaceExisting?: boolean; auto?: boolean }) => {
    if (isCapturing || !cameraRef.current) return;
    if (captureLockRef.current) return;
    captureLockRef.current = true;
    if (!selectedExamId) {
      setGuidanceMsg('Please select an active OMR exam first');
      setGuidanceType('warning');
      return;
    }

    setIsCapturing(true);
    setGuidanceMsg('Processing OMR Sheet...');
    setGuidanceType('info');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let photoBase64 = '';
    const qr = detectedQrRef.current;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.55,
        base64: true,
        skipProcessing: true,
      });

      photoBase64 = photo?.base64 || '';
      if (!photoBase64) {
        throw new Error('Failed to capture high-resolution frame');
      }

      const result = await omrService.processScan({
        omr_exam_id: selectedExamId,
        imageBase64: photoBase64,
        batch_id: activeBatchId || params.batchId || undefined,
        sheet_id: qr?.sid,
        qr_payload: qr?.raw,
        replace_existing: opts?.replaceExisting,
      });

      if (qr?.sid) lastCapturedSheetRef.current = qr.sid;
      setBatchCount((prev) => prev + 1);
      if (result.status === 'REVIEW_REQUIRED') {
        setReviewCount((prev) => prev + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPreviewScan(result);
        setShowPreviewModal(true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (batchMode) {
          setGuidanceMsg(`Scanned ${result.sheetId}. Ready for next sheet.`);
          setGuidanceType('success');
          autoNextTimerRef.current = setTimeout(() => {
            setGuidanceMsg('Align the next sheet');
            setGuidanceType('info');
          }, 900);
        } else {
          setPreviewScan(result);
          setShowPreviewModal(true);
        }
      }
    } catch (err: any) {
      console.warn('Scan capture error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (err instanceof APIError && err.statusCode === 409 && err.code === 'DUPLICATE_SHEET') {
        setGuidanceMsg('Duplicate OMR sheet');
        setGuidanceType('warning');
        setPreviewScan({
          scanId: '',
          sheetId: qr?.sid || '',
          status: 'DUPLICATE',
          overallConfidence: 0,
          detectedRollNumber: null,
          evaluation: { totalScore: 0, maxPossibleScore: 0, percentage: 0, correctCount: 0, wrongCount: 0, blankCount: 0, multipleCount: 0 },
          quality: { status: 'WARNING', guidance: 'This sheet was already scanned.' },
          answers: [],
        } as any);
        setShowPreviewModal(true);
      } else if (err instanceof APIError && (err.statusCode === 0 || err.message?.toLowerCase().includes('network'))) {
        await omrOfflineQueue.enqueueScan({
          omrExamId: selectedExamId,
          sheetId: qr?.sid || `SHT-OFFLINE-${Date.now()}`,
          imageBase64: photoBase64,
          batchId: activeBatchId || params.batchId || undefined,
          qrPayload: qr?.raw,
          qualityScore: 'WARNING',
        });
        setGuidanceMsg('Offline: Sheet saved to local sync queue');
        setGuidanceType('warning');
      } else {
        try {
          if (photoBase64) {
            await omrOfflineQueue.enqueueScan({
              omrExamId: selectedExamId,
              sheetId: qr?.sid || `SHT-OFFLINE-${Date.now()}`,
              imageBase64: photoBase64,
              batchId: activeBatchId || params.batchId || undefined,
              qrPayload: qr?.raw,
              qualityScore: 'WARNING',
            });
            setGuidanceMsg('Saved locally. Will sync when the network returns.');
            setGuidanceType('warning');
          } else {
            setGuidanceMsg(err?.message || 'Unable to read the sheet. Please align the page and scan again.');
            setGuidanceType('warning');
          }
        } catch {
          setGuidanceMsg(err?.message || 'Unable to read the sheet. Please align the page and scan again.');
          setGuidanceType('warning');
        }
      }
    } finally {
      captureLockRef.current = false;
      setIsCapturing(false);
    }
  }, [isCapturing, selectedExamId, batchMode, params.batchId, activeBatchId]);

  const handleNextSheet = useCallback(() => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    setShowPreviewModal(false);
    setPreviewScan(null);
    setGuidanceMsg('Ready for next sheet. Align in frame.');
    setGuidanceType('info');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  useEffect(() => {
    if (!selectedExamId) return;
    omrService.startBatch({
      omr_exam_id: selectedExamId,
      name: `Batch ${new Date().toLocaleTimeString()}`,
    }).then((res) => {
      if (res.data?.id) setActiveBatchId(res.data.id);
    }).catch(() => {});
  }, [selectedExamId]);

  useEffect(() => {
    if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
    autoCaptureTimerRef.current = setInterval(() => {
      const qr = detectedQrRef.current;
      if (!qr || isCapturing || showPreviewModal || !selectedExamId) return;
      if (lastCapturedSheetRef.current === qr.sid) return;
      if (Date.now() - qr.at > 1200) return;
      if (Date.now() - qr.at < 700) return;
      handleCapture({ auto: true }).catch(() => {});
    }, 250);
    return () => {
      if (autoCaptureTimerRef.current) clearInterval(autoCaptureTimerRef.current);
    };
  }, [handleCapture, isCapturing, selectedExamId, showPreviewModal]);

  if (!permission) {
    return (
      <View style={styles.centerRoot}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Initializing OMR Camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerRoot}>
        <Ionicons name="camera-outline" size={60} color="#EF4444" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSub}>
          SchoolIMS OMR scanner requires high-resolution camera access to detect and evaluate bubble sheets.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TourTarget id="screen.staff-omr-scanner.overview" native><TourTarget id="screen.staff-omr-scanner.workspace" native><View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live Camera Feed */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onBarcodeScanned}
      />

      {/* Viewfinder Reticle & Guidance Overlay */}
      <SafeAreaView style={styles.overlayContainer} edges={['top', 'bottom']}>
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.circleBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable style={styles.examPickerChip} onPress={() => setShowExamPicker(true)}>
            <Ionicons name="clipboard-outline" size={14} color="#38BDF8" />
            <Text style={styles.examPickerText} numberOfLines={1}>
              {exams.find((e) => e.id === selectedExamId)?.title || 'Select OMR Exam'}
            </Text>
          </Pressable>

          <View style={styles.topRightActions}>
            {offlinePendingCount > 0 && (
              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-offline" size={13} color="#F59E0B" />
                <Text style={styles.offlineText}>{offlinePendingCount}</Text>
              </View>
            )}
            <Pressable
              style={[styles.circleBtn, torch && styles.torchActive]}
              onPress={() => setTorch((prev) => !prev)}
            >
              <Ionicons name={torch ? 'flash' : 'flash-outline'} size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Real-time Guidance Banner */}
        <View style={[styles.guidanceBanner, guidanceType === 'success' ? styles.guidanceSuccess : (guidanceType === 'warning' ? styles.guidanceWarning : null)]}>
          <Ionicons
            name={guidanceType === 'success' ? 'checkmark-circle' : (guidanceType === 'warning' ? 'alert-circle' : 'scan-outline')}
            size={16}
            color="#FFFFFF"
          />
          <Text style={styles.guidanceText}>{guidanceMsg}</Text>
        </View>

        {/* Viewfinder Reticle Area */}
        <View style={styles.viewfinderContainer}>
          <View style={styles.viewfinderFrame}>
            {/* 4 Corner Markers Indicators */}
            <View style={[styles.cornerBracket, styles.bracketTL]} />
            <View style={[styles.cornerBracket, styles.bracketTR]} />
            <View style={[styles.cornerBracket, styles.bracketBL]} />
            <View style={[styles.cornerBracket, styles.bracketBR]} />

            {/* Target Reticle Crosshairs */}
            <View style={styles.centerTarget}>
              <View style={styles.centerDot} />
            </View>

            {/* Alignment Guide Text */}
            <Text style={styles.frameGuideText}>KEEP ALL 4 CORNER SQUARES VISIBLE</Text>
          </View>
        </View>

        {/* Bottom Control Bar */}
        <View style={styles.bottomBar}>
          {/* Batch Mode Toggle */}
          <Pressable
            style={[styles.modeToggleBtn, batchMode && styles.modeToggleActive]}
            onPress={() => setBatchMode((prev) => !prev)}
          >
            <Ionicons name="layers-outline" size={16} color={batchMode ? '#38BDF8' : '#94A3B8'} />
            <Text style={[styles.modeToggleText, batchMode && styles.modeToggleTextActive]}>
              {batchMode ? `BATCH: ${batchCount}` : 'SINGLE'}
            </Text>
          </Pressable>

          {/* Shutter Capture Button */}
          <TouchableOpacity
            style={[styles.shutterOuter, isCapturing && styles.shutterDisabled]}
            disabled={isCapturing}
            onPress={() => void handleCapture()}
          >
            <View style={styles.shutterInner}>
              {isCapturing ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <View style={styles.shutterCore} />
              )}
            </View>
          </TouchableOpacity>

          {/* Review Shortcut / Stats */}
          <Pressable
            style={styles.reviewShortcutBtn}
            onPress={() => router.push('/staff/omr-review' as any)}
          >
            <Ionicons name="stats-chart" size={18} color="#FFFFFF" />
            {reviewCount > 0 && (
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewBadgeText}>{reviewCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={showExamPicker} transparent animationType="fade" onRequestClose={() => setShowExamPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeaderTitle}>Select OMR exam</Text>
            <TourScrollView style={{ maxHeight: 320, marginTop: 12 }}>
              {exams.map((exam) => (
                <TouchableOpacity
                  key={exam.id}
                  style={[styles.examPickerChip, { marginBottom: 8, width: '100%' }]}
                  onPress={() => {
                    setSelectedExamId(exam.id);
                    setShowExamPicker(false);
                  }}
                >
                  <Text style={styles.examPickerText}>{exam.title}</Text>
                </TouchableOpacity>
              ))}
              {exams.length === 0 && (
                <Text style={styles.permissionSub}>No OMR exams are configured yet.</Text>
              )}
            </TourScrollView>
            <TouchableOpacity style={styles.nextSheetBtn} onPress={() => setShowExamPicker(false)}>
              <Text style={styles.nextSheetBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Result Preview & Fast-Forward Modal */}
      <Modal visible={showPreviewModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Status Header */}
            <View style={[styles.modalHeader, previewScan?.status === 'REVIEW_REQUIRED' ? styles.headerWarning : styles.headerSuccess]}>
              <Ionicons
                name={previewScan?.status === 'REVIEW_REQUIRED' ? 'warning' : 'checkmark-circle'}
                size={28}
                color="#FFFFFF"
              />
              <View style={styles.modalHeaderTextWrap}>
                <Text style={styles.modalHeaderTitle}>
                  {previewScan?.status === 'REVIEW_REQUIRED' ? 'Review Required' : 'Evaluation Successful'}
                </Text>
                <Text style={styles.modalHeaderSub}>
                  Sheet: {previewScan?.sheetId} • Roll: {previewScan?.detectedRollNumber || 'Unidentified'}
                </Text>
              </View>
            </View>

            {/* Score & Summary Metrics */}
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreValue}>
                  {previewScan?.evaluation?.totalScore ?? 0}
                  <Text style={styles.scoreMax}> / {previewScan?.evaluation?.maxPossibleScore ?? 0}</Text>
                </Text>
                <Text style={styles.scoreLabel}>Score</Text>
              </View>

              <View style={styles.dividerV} />

              <View style={styles.scoreBox}>
                <Text style={[styles.scoreValue, { color: '#10B981' }]}>
                  {previewScan?.evaluation?.percentage ?? 0}%
                </Text>
                <Text style={styles.scoreLabel}>Percentage</Text>
              </View>

              <View style={styles.dividerV} />

              <View style={styles.scoreBox}>
                <Text style={[styles.scoreValue, { color: '#38BDF8' }]}>
                  {previewScan?.overallConfidence ?? 0}%
                </Text>
                <Text style={styles.scoreLabel}>Confidence</Text>
              </View>
            </View>

            {/* Answer Breakdown Pills */}
            <View style={styles.breakdownRow}>
              <View style={[styles.pill, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.pillText, { color: '#059669' }]}>
                  ✓ {previewScan?.evaluation?.correctCount ?? 0} Correct
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: '#FEF2F2' }]}>
                <Text style={[styles.pillText, { color: '#DC2626' }]}>
                  ✕ {previewScan?.evaluation?.wrongCount ?? 0} Wrong
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: '#F1F5F9' }]}>
                <Text style={[styles.pillText, { color: '#64748B' }]}>
                  ○ {previewScan?.evaluation?.blankCount ?? 0} Blank
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              {previewScan?.status === 'DUPLICATE' && (
                <TouchableOpacity
                  style={styles.reviewBtn}
                  onPress={() => handleCapture({ replaceExisting: true })}
                >
                  <Text style={styles.reviewBtnText}>Replace Scan</Text>
                </TouchableOpacity>
              )}

              {previewScan?.status === 'REVIEW_REQUIRED' && (
                <TouchableOpacity
                  style={styles.reviewBtn}
                  onPress={() => {
                    setShowPreviewModal(false);
                    router.push({
                      pathname: '/staff/omr-review',
                      params: { scanId: previewScan?.scanId },
                    } as any);
                  }}
                >
                  <Text style={styles.reviewBtnText}>Inspect Ambiguities</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.nextSheetBtn} onPress={handleNextSheet}>
                <Text style={styles.nextSheetBtnText}>
                  {batchMode ? 'Next Sheet ➔' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View></TourTarget></TourTarget>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  centerRoot: { flex: 1, backgroundColor: '#0B0F19', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#94A3B8', marginTop: 14, fontSize: 14 },
  permissionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 16 },
  permissionSub: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  grantBtn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 24 },
  grantBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  overlayContainer: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  torchActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  examPickerChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  examPickerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginLeft: 6 },
  topRightActions: { flexDirection: 'row', alignItems: 'center' },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  offlineText: { color: '#F59E0B', fontSize: 11, fontWeight: '700', marginLeft: 4 },

  guidanceBanner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  guidanceSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.85)', borderColor: '#10B981' },
  guidanceWarning: { backgroundColor: 'rgba(245, 158, 11, 0.85)', borderColor: '#F59E0B' },
  guidanceText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 8 },

  viewfinderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  viewfinderFrame: {
    width: SCREEN_WIDTH * 0.86,
    height: SCREEN_WIDTH * 0.86 * 1.38, // A4 aspect ratio representation
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBracket: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#38BDF8',
  },
  bracketTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  bracketTR: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  bracketBL: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  bracketBR: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },

  centerTarget: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#38BDF8' },
  frameGuideText: {
    position: 'absolute',
    bottom: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  modeToggleActive: { borderColor: '#38BDF8' },
  modeToggleText: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  modeToggleTextActive: { color: '#38BDF8' },

  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0F172A',
  },

  reviewShortcutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    position: 'relative',
  },
  reviewBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  reviewBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerSuccess: { backgroundColor: '#059669' },
  headerWarning: { backgroundColor: '#D97706' },
  modalHeaderTextWrap: { marginLeft: 12 },
  modalHeaderTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  modalHeaderSub: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, marginTop: 2 },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 20,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  scoreBox: { alignItems: 'center' },
  scoreValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  scoreMax: { fontSize: 13, fontWeight: '500', color: '#64748B' },
  scoreLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginTop: 4 },
  dividerV: { width: 1, height: 32, backgroundColor: '#CBD5E1' },

  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  pillText: { fontSize: 12, fontWeight: '700' },

  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  reviewBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBtnText: { color: '#334155', fontWeight: '700', fontSize: 13 },
  nextSheetBtn: {
    flex: 2,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextSheetBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
