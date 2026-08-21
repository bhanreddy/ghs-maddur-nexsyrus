import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons'; // Assuming Expo
import ScreenLayout from '../../src/components/ScreenLayout';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { api } from '../../src/services/apiClient';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
const COLORS = ADMIN_THEME.colors;
const SHADOWS = ADMIN_THEME.shadows;
interface ClassItem {
  id: string;
  name: string;
}
interface PreviewStats {
  total_students: number;
  total_outstanding?: number;
  sample_message: string;
  batch_id?: string;
}
const FeeRemindersAdmin = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const {
    user
  } = useAuth();
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('default', {
    month: 'long'
  }));
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [paidRange, setPaidRange] = useState({ min: 0, max: 100 });
  const [minPaidInput, setMinPaidInput] = useState('0');
  const [maxPaidInput, setMaxPaidInput] = useState('100');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  useEffect(() => {
    fetchClasses();
  }, []);
  useEffect(() => {
    if (selectedMonth) {
      fetchPreview();
    }
  }, [selectedMonth, selectedClass, paidRange]);

  const applyPaidRange = () => {
    const min = Number(minPaidInput);
    const max = Number(maxPaidInput);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) {
      alertCompat('Invalid range', 'Enter percentages from 0 to 100. Minimum cannot exceed maximum.');
      return;
    }
    setPaidRange({ min, max });
  };
  const fetchClasses = async () => {
    try {
      // Fetch classes from your existing API
      // For now, mocking or using a known endpoint if available. 
      // Assuming /academics/classes exists based on routes.
      const response = await api.get('/academics/classes');
      setClasses(response as ClassItem[]);
    } catch (error) {

    }
  };
  const fetchPreview = async () => {
    setLoading(true);
    try {
      const payload = {
        month: selectedMonth,
        filters: {
          ...(selectedClass ? { class_id: selectedClass } : {}),
          fee_paid_min_percent: paidRange.min,
          fee_paid_max_percent: paidRange.max,
        },
        dryRun: true
      };
      const response = await api.post('/admin/notifications/fees/send-all', payload);
      setPreviewStats(response as PreviewStats);
    } catch (error: any) {

      if (error.statusCode === 429) {
        alertCompat('Limit Reached', 'Daily limit reached for this batch type.');
      }
    } finally {
      setLoading(false);
    }
  };
  const handleSendAll = async () => {
    setModalVisible(false);
    setLoading(true);
    try {
      const payload = {
        month: selectedMonth,
        filters: {
          ...(selectedClass ? { class_id: selectedClass } : {}),
          fee_paid_min_percent: paidRange.min,
          fee_paid_max_percent: paidRange.max,
        },
        dryRun: false
      };
      const response = await api.post('/admin/notifications/fees/send-all', payload);
      const data = response as {
        batch_id: string;
      };
      setBatchId(data.batch_id);
      alertCompat('Success', `Batch processing started. Batch ID: ${data.batch_id}`);
      // Optionally redirect to a "Batch Status" page or just reset
    } catch (error: any) {
      alertCompat('Error', error.message || 'Failed to send notifications');
    } finally {
      setLoading(false);
    }
  };
  return <ScreenLayout>
    <AdminHeader title="Fee Reminders" showBackButton={true} />
    <ScrollView style={styles.container}>
      {/* Month Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Select Month</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthSelector}>
          {months.map((month) => {
            return <TouchableOpacity key={month} style={[styles.monthChip, selectedMonth === month && styles.selectedMonth]} onPress={() => setSelectedMonth(month)}>
              <Text style={[styles.monthText, selectedMonth === month && styles.selectedMonthText]}>{month}</Text>
            </TouchableOpacity>;
          })}
        </ScrollView>
      </View>
      {/* Class Filter */}
      <View style={styles.section}>
        <Text style={styles.label}>Filter by Class (Optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classSelector}>
          <TouchableOpacity style={[styles.classChip, !selectedClass && styles.selectedClass]} onPress={() => setSelectedClass(null)}>
            <Text style={[styles.classText, !selectedClass && styles.selectedClassText]}>All Classes</Text>
          </TouchableOpacity>
          {classes.map((cls) => {
            return <TouchableOpacity key={cls.id} style={[styles.classChip, selectedClass === cls.id && styles.selectedClass]} onPress={() => setSelectedClass(cls.id)}>
              <Text style={[styles.classText, selectedClass === cls.id && styles.selectedClassText]}>{cls.name}</Text>
            </TouchableOpacity>;
          })}
        </ScrollView>
      </View>
      {/* Paid percentage filter */}
      <View style={styles.section}>
        <Text style={styles.label}>Percentage Already Paid</Text>
        <Text style={styles.helperText}>Only students in this range who still have unpaid fees will receive a reminder.</Text>
        <View style={styles.rangeRow}>
          <View style={styles.rangeInputWrap}>
            <TextInput value={minPaidInput} onChangeText={setMinPaidInput} keyboardType="decimal-pad" inputMode="decimal" style={styles.rangeInput} accessibilityLabel="Minimum percentage paid" />
            <Text style={styles.percentText}>%</Text>
          </View>
          <Text style={styles.rangeTo}>to</Text>
          <View style={styles.rangeInputWrap}>
            <TextInput value={maxPaidInput} onChangeText={setMaxPaidInput} keyboardType="decimal-pad" inputMode="decimal" style={styles.rangeInput} accessibilityLabel="Maximum percentage paid" />
            <Text style={styles.percentText}>%</Text>
          </View>
          <TouchableOpacity style={styles.applyButton} onPress={applyPaidRange}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.activeRange}>Applied range: {paidRange.min}%–{paidRange.max}% paid</Text>
      </View>
      {/* Preview Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preview</Text>
        {loading && !previewStats ? <LogoLoader /> : <View>
          <View style={styles.statRow}>
            <Text>Target Students:</Text>
            <Text style={styles.statValue}>{previewStats?.total_students || 0}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={{ color: theme.colors.text }}>Outstanding Balance:</Text>
            <Text style={styles.balanceValue}>₹{Number(previewStats?.total_outstanding || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.divider} />
          <Text style={styles.sampleLabel}>Sample Message:</Text>
          <Text style={styles.sampleText}>{previewStats?.sample_message || '-'}</Text>
        </View>}
      </View>
      {/* Send Button */}
      <TouchableOpacity style={[styles.sendButton, (loading || !previewStats?.total_students) && styles.disabledButton]} disabled={loading || !previewStats?.total_students} onPress={() => setModalVisible(true)}>
        <Text style={styles.sendButtonText}>{loading ? 'Processing...' : 'SEND ALL REMINDERS'}</Text>
      </TouchableOpacity>
      {/* Confirmation Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color={COLORS.danger || 'red'} />
            <Text style={styles.modalTitle}>Confirm Bulk Send?</Text>
            <Text style={styles.modalText}>
              You are about to send fee reminders to <Text style={{
                fontWeight: 'bold'
              }}>{previewStats?.total_students}</Text> students for <Text style={{
                fontWeight: 'bold'
              }}>{selectedMonth}</Text>.
            </Text>
            <Text style={styles.modalSubText}>Students have paid {paidRange.min}%–{paidRange.max}% and still have an outstanding balance.</Text>
            <Text style={styles.modalSubText}>This action cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleSendAll}>
                <Text style={styles.confirmButtonText}>CONFIRM SEND</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </ScreenLayout>;
};
export default FeeRemindersAdmin;
const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    padding: 16
  },
  section: {
    marginBottom: 20
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: theme.colors.text
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  rangeInputWrap: {
    minWidth: 90,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 12
  },
  rangeInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  percentText: {
    color: theme.colors.textSecondary,
    fontWeight: '700'
  },
  rangeTo: {
    color: theme.colors.textSecondary,
    fontWeight: '600'
  },
  applyButton: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.primary || '#007bff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '800'
  },
  activeRange: {
    color: COLORS.primary || '#007bff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 9
  },
  monthSelector: {
    flexDirection: 'row'
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  selectedMonth: {
    backgroundColor: '#007bff',
    borderColor: '#0056b3'
  },
  monthText: {
    color: theme.colors.text
  },
  selectedMonthText: {
    color: theme.colors.background
  },
  classSelector: {
    flexDirection: 'row'
  },
  classChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  selectedClass: {
    backgroundColor: '#007bff',
    borderColor: '#0056b3'
  },
  classText: {
    color: theme.colors.text
  },
  selectedClassText: {
    color: theme.colors.background
  },
  card: {
    backgroundColor: theme.colors.background,
    padding: 20,
    borderRadius: 10,
    ...SHADOWS.md,
    marginBottom: 20
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007bff'
  },
  balanceValue: {
    color: '#D97706',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 8
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 15
  },
  sampleLabel: {
    fontWeight: 'bold',
    marginBottom: 5,
    color: theme.colors.textSecondary
  },
  sampleText: {
    fontStyle: 'italic',
    color: '#444'
  },
  sendButton: {
    backgroundColor: COLORS.primary || '#007bff',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 40
  },
  disabledButton: {
    backgroundColor: '#ccc'
  },
  sendButtonText: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    width: '85%',
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    padding: 25,
    alignItems: 'center'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 10
  },
  modalText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 5,
    color: theme.colors.text
  },
  modalSubText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 20
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between'
  },
  cancelButton: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    marginRight: 10
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: 'bold'
  },
  confirmButton: {
    flex: 1,
    backgroundColor: 'red',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center'
  },
  confirmButtonText: {
    color: theme.colors.background,
    fontWeight: 'bold'
  }
});
