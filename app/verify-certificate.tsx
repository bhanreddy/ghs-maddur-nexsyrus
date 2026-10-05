import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { GovernanceService, CertificateVerifyResponse } from '../src/services/governanceService';
import { eventService } from '../src/services/eventService';

export default function VerifyCertificateScreen() {
  const params = useLocalSearchParams<{ id?: string; serial?: string }>();
  const initialQuery = params.id || params.serial || '';

  const [inputVal, setInputVal] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertificateVerifyResponse | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (initialQuery.trim()) {
      handleVerify(initialQuery.trim());
    }
  }, [initialQuery]);

  const handleVerify = async (queryToUse?: string) => {
    const q = (queryToUse || inputVal).trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await GovernanceService.verifyCertificate(q);
      if (res && res.valid) {
        setResult(res);
        return;
      }
      throw new Error('Not found in academic governance');
    } catch (err: any) {
      try {
        const evCert = await eventService.verifyCertificate(q);
        if (evCert?.data) {
          const c = evCert.data;
          setResult({
            success: true,
            valid: true,
            status: 'VALID',
            certificate: {
              certificate_number: c.certificate_number,
              title: c.certificate_title || 'Event Certificate',
              recipient_name: c.recipient_name,
              issued_date: c.issued_at,
              school_name: c.school_name || 'NexSyrus Institution',
              type: 'EVENT',
            } as any,
          });
          return;
        }
      } catch (evErr: any) {
        // Fall through to invalid
      }
      setResult({
        success: false,
        valid: false,
        status: 'INVALID',
        error: err?.response?.data?.error || err.message || 'Certificate record could not be found',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status?: string) => {
    if (status === 'VALID') return '#16a34a';
    if (status === 'REVOKED') return '#dc2626';
    return '#64748b';
  };

  const cert = result?.certificate;

  return (
    <SafeAreaView style={styles.safeArea}>
      <TourTarget id="screen.verify-certificate.workspace" native><TourScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <TourTarget id="screen.verify-certificate.overview" native><View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="shield-checkmark" size={26} color="#2563eb" />
            <Text style={styles.appTitle}>SchoolIMS Verification Portal</Text>
          </View>
          <Text style={styles.pageTitle}>Public Certificate Verification</Text>
          <Text style={styles.pageSubtitle}>
            Verify official Transfer Certificates and Bonafide Certificates issued by SchoolIMS.
          </Text>
        </View></TourTarget>

        {/* Search Box */}
        <View style={styles.searchCard}>
          <Text style={styles.inputLabel}>Enter Certificate Serial Number or UUID</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. TC-2026-0001 or Certificate UUID"
              placeholderTextColor="#94a3b8"
              value={inputVal}
              onChangeText={setInputVal}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => handleVerify()}
            />
            <TouchableOpacity
              style={[styles.verifyButton, loading && styles.disabledButton]}
              onPress={() => handleVerify()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="search" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.verifyButtonText}>Verify</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Verification Result */}
        {searched && (
          <View style={styles.resultContainer}>
            {result?.valid && cert ? (
              <View style={[styles.resultCard, { borderColor: getStatusColor(cert.status) }]}>
                {/* Status banner */}
                <View
                  style={[
                    styles.statusBanner,
                    { backgroundColor: cert.status === 'VALID' ? '#f0fdf4' : '#fef2f2' },
                  ]}
                >
                  <Ionicons
                    name={cert.status === 'VALID' ? 'checkmark-circle' : 'alert-circle'}
                    size={28}
                    color={getStatusColor(cert.status)}
                  />
                  <View style={styles.statusBannerTextCol}>
                    <Text
                      style={[styles.statusBannerTitle, { color: getStatusColor(cert.status) }]}
                    >
                      {cert.status === 'VALID' ? 'OFFICIAL VALID RECORD' : 'CERTIFICATE REVOKED'}
                    </Text>
                    <Text style={styles.statusBannerDesc}>
                      {cert.status === 'VALID'
                        ? 'This certificate is verified and authentic on school records.'
                        : 'This certificate has been marked as REVOKED by school administration.'}
                    </Text>
                  </View>
                </View>

                {/* Details grid */}
                <View style={styles.detailsGrid}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>School Name</Text>
                    <Text style={styles.detailValueBold}>{cert.school_name || 'N/A'}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Certificate Type</Text>
                    <Text style={styles.detailValue}>
                      {cert.type === 'TC' ? 'Transfer Certificate (TC)' : 'Bonafide Certificate'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Serial Number</Text>
                    <Text style={[styles.detailValueBold, { color: '#2563eb' }]}>
                      {cert.serial_no}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Student Name</Text>
                    <Text style={styles.detailValue}>{cert.student_name_masked}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Issue Date</Text>
                    <Text style={styles.detailValue}>
                      {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }) : 'N/A'}
                    </Text>
                  </View>
                </View>

                {/* Privacy note */}
                <View style={styles.privacyNote}>
                  <Ionicons name="lock-closed" size={14} color="#64748b" />
                  <Text style={styles.privacyNoteText}>
                    Privacy notice: Personal student identifiers (phone, Aadhaar, parents, dues) are never exposed on public records.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.resultCard, { borderColor: '#ef4444' }]}>
                <View style={[styles.statusBanner, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="close-circle" size={28} color="#ef4444" />
                  <View style={styles.statusBannerTextCol}>
                    <Text style={[styles.statusBannerTitle, { color: '#ef4444' }]}>
                      RECORD NOT FOUND
                    </Text>
                    <Text style={styles.statusBannerDesc}>
                      {result?.error || 'No matching certificate record was found for this identifier.'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.invalidHelperText}>
                  Please double check the serial number or UUID printed on the physical certificate. If you suspect fraud, please contact the issuing school office.
                </Text>
              </View>
            )}
          </View>
        )}
      </TourScrollView></TourTarget>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 24,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 480,
  },
  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  verifyButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  verifyButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  resultContainer: {
    marginTop: 8,
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statusBannerTextCol: {
    marginLeft: 14,
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBannerDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  detailsGrid: {
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  detailValueBold: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  privacyNoteText: {
    fontSize: 11,
    color: '#64748b',
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
  invalidHelperText: {
    padding: 20,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
});
