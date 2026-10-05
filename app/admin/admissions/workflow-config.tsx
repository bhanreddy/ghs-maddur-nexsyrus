import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../../src/components/AdminHeader';
import { admissionService } from '../../../src/services/admissionService';
import { showAlert } from '../../../src/components/CustomAlert';

export default function AdmissionWorkflowConfigScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings State
  const [isAdmissionOpen, setIsAdmissionOpen] = useState(true);
  const [applicationFee, setApplicationFee] = useState('0');
  const [allowOnlinePayment, setAllowOnlinePayment] = useState(false);
  const [admissionNoPrefix, setAdmissionNoPrefix] = useState('ADM');
  const [admissionNoPattern, setAdmissionNoPattern] = useState('ADM/{YEAR}/{SEQ:4}');
  const [slaHoursPerStage, setSlaHoursPerStage] = useState('48');

  // Capacities & Documents
  const [capacities, setCapacities] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await admissionService.getSettings();
      const s = res.settings || {};
      setIsAdmissionOpen(s.is_admission_open ?? true);
      setApplicationFee(String(s.application_fee || 0));
      setAllowOnlinePayment(Boolean(s.allow_online_payment));
      setAdmissionNoPrefix(s.admission_number_prefix || 'ADM');
      setAdmissionNoPattern(s.admission_number_pattern || 'ADM/{YEAR}/{SEQ:4}');
      setSlaHoursPerStage(String(s.default_sla_hours_per_stage || 48));

      setCapacities(res.capacities || []);
      setDocuments(res.documentRequirements || []);
      setStages(res.workflowStages || []);
    } catch (err: any) {
      showAlert({
        title: 'Error Loading Settings',
        message: err?.message || 'Could not fetch admission settings',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await admissionService.updateSettings({
        settings: {
          is_admission_open: isAdmissionOpen,
          application_fee: Number(applicationFee) || 0,
          allow_online_payment: allowOnlinePayment,
          admission_number_prefix: admissionNoPrefix.trim(),
          admission_number_pattern: admissionNoPattern.trim(),
          default_sla_hours_per_stage: Number(slaHoursPerStage) || 48,
        },
        capacities,
        documentRequirements: documents,
        workflowStages: stages,
      });

      showAlert({
        title: 'Settings Saved',
        message: 'Admission settings and capacity rules updated successfully.',
        type: 'success',
      });
    } catch (err: any) {
      showAlert({
        title: 'Save Failed',
        message: err?.message || 'Failed to update settings',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCapacityChange = (index: number, maxCapacity: string) => {
    const updated = [...capacities];
    updated[index] = {
      ...updated[index],
      max_capacity: Number(maxCapacity) || 0,
    };
    setCapacities(updated);
  };

  const handleToggleDocMandatory = (index: number) => {
    const updated = [...documents];
    updated[index] = {
      ...updated[index],
      is_mandatory: !updated[index].is_mandatory,
    };
    setDocuments(updated);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Loading admission configurations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-admissions-workflow-config.overview"><AdminHeader title="Admission Settings & Capacities" showBackButton /></TourTarget>

      <TourTarget id="screen.admin-admissions-workflow-config.workspace" native><TourScrollView style={styles.mainScroll} contentContainerStyle={styles.scrollContent}>
        {/* Portal Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>General Portal Policy</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Public Admissions Open</Text>
              <Text style={styles.settingDesc}>
                Allow public applicants and parents to submit admission enquiries & applications.
              </Text>
            </View>
            <Switch
              value={isAdmissionOpen}
              onValueChange={setIsAdmissionOpen}
              trackColor={{ false: '#CBD5E1', true: '#0F766E' }}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Allow Online Fee Collection</Text>
              <Text style={styles.settingDesc}>
                Enable UPI / gateway payment at provisional admission offer stage.
              </Text>
            </View>
            <Switch
              value={allowOnlinePayment}
              onValueChange={setAllowOnlinePayment}
              trackColor={{ false: '#CBD5E1', true: '#0F766E' }}
            />
          </View>
        </View>

        {/* Numbering & SLA Rules */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Admission Numbering & SLAs</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Admission Number Format Pattern</Text>
            <TextInput
              style={styles.input}
              value={admissionNoPattern}
              onChangeText={setAdmissionNoPattern}
              placeholder="e.g. ADM/{YEAR}/{SEQ:4}"
            />
            <Text style={styles.helperText}>
              Variables: {'{YEAR}'} (current 2-digit/4-digit year), {'{SEQ:N}'} (zero-padded sequence number)
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Default SLA Hours per Stage</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={slaHoursPerStage}
              onChangeText={setSlaHoursPerStage}
              placeholder="48"
            />
            <Text style={styles.helperText}>
              Applications exceeding this time in a pending stage will be flagged with SLA Breach.
            </Text>
          </View>
        </View>

        {/* Class Capacity Allocation */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Grade / Class Seat Capacities</Text>
          <Text style={styles.cardSub}>
            Set the maximum intake seats per grade to prevent over-subscription.
          </Text>

          {capacities.length === 0 ? (
            <Text style={styles.emptyNote}>No classes configured for this academic year.</Text>
          ) : (
            capacities.map((cap, idx) => {
              const max = cap.max_capacity || 0;
              const enrolled = cap.enrolled_count || 0;
              const available = Math.max(0, max - enrolled);

              return (
                <View key={cap.class_id || idx} style={styles.capacityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.classTitle}>{cap.class_name}</Text>
                    <Text style={styles.capacityMeta}>
                      Enrolled: {enrolled} • Available: <Text style={{ color: available > 0 ? '#059669' : '#DC2626', fontWeight: '700' }}>{available}</Text>
                    </Text>
                  </View>

                  <View style={styles.capacityInputWrapper}>
                    <Text style={styles.capacityInputLabel}>Max Seats:</Text>
                    <TextInput
                      style={styles.capacityInput}
                      keyboardType="numeric"
                      value={String(max)}
                      onChangeText={(val) => handleCapacityChange(idx, val)}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Document Checklist Requirements */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Document Checklist Rules</Text>
          <Text style={styles.cardSub}>
            Configure whether each document is mandatory before admission conversion can proceed.
          </Text>

          {documents.map((doc, idx) => (
            <View key={doc.id || idx} style={styles.docSettingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docSettingTitle}>{doc.title || doc.code}</Text>
                <Text style={styles.docSettingDesc}>{doc.description || doc.code}</Text>
              </View>

              <View style={styles.docToggleCol}>
                <Text style={styles.docToggleLabel}>
                  {doc.is_mandatory ? 'Mandatory' : 'Optional'}
                </Text>
                <Switch
                  value={Boolean(doc.is_mandatory)}
                  onValueChange={() => handleToggleDocMandatory(idx)}
                  trackColor={{ false: '#CBD5E1', true: '#0F766E' }}
                />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Workflow Stages</Text>
          <Text style={styles.cardSub}>
            Enable, require, and set SLA hours for each admission stage. Inactive stages are skipped for this school.
          </Text>
          {stages.map((stage, idx) => (
            <View key={stage.id || stage.code || idx} style={styles.docSettingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docSettingTitle}>{stage.name || stage.code}</Text>
                <Text style={styles.docSettingDesc}>{stage.description || stage.code}</Text>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  keyboardType="numeric"
                  value={String(stage.sla_hours ?? 24)}
                  onChangeText={(val) => {
                    const updated = [...stages];
                    updated[idx] = { ...updated[idx], sla_hours: Number(val) || 0 };
                    setStages(updated);
                  }}
                />
              </View>
              <View style={styles.docToggleCol}>
                <Text style={styles.docToggleLabel}>{stage.is_active ? 'Active' : 'Off'}</Text>
                <Switch
                  value={Boolean(stage.is_active)}
                  onValueChange={() => {
                    const updated = [...stages];
                    updated[idx] = { ...updated[idx], is_active: !updated[idx].is_active };
                    setStages(updated);
                  }}
                  trackColor={{ false: '#CBD5E1', true: '#0F766E' }}
                />
                <Text style={[styles.docToggleLabel, { marginTop: 8 }]}>{stage.is_mandatory ? 'Required' : 'Optional'}</Text>
                <Switch
                  value={Boolean(stage.is_mandatory)}
                  onValueChange={() => {
                    const updated = [...stages];
                    updated[idx] = { ...updated[idx], is_mandatory: !updated[idx].is_mandatory };
                    setStages(updated);
                  }}
                  trackColor={{ false: '#CBD5E1', true: '#0F766E' }}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Save CTA */}
        <TouchableOpacity
          style={[styles.saveSettingsBtn, saving && styles.btnDisabled]}
          onPress={handleSaveSettings}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveSettingsBtnText}>Save All Configurations</Text>
            </>
          )}
        </TouchableOpacity>
      </TourScrollView></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#0F172A',
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  classTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  capacityMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  capacityInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  capacityInputLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  capacityInput: {
    width: 60,
    height: 36,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  docSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  docSettingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  docSettingDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  docToggleCol: {
    alignItems: 'center',
  },
  docToggleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  saveSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  saveSettingsBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  emptyNote: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});
