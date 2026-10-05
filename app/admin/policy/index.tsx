import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import AppTextInput from '@/src/components/AppTextInput';

import { View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PolicyService } from '../../../src/services/policyService';
import { FinancialPolicyRule, FinancialAuditLog } from '../../../src/types/models';
import LogoLoader from '../../../src/components/LogoLoader';

export default function PolicyManagerScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'rules' | 'audit'>('rules');
  const [rules, setRules] = useState<FinancialPolicyRule[]>([]);
  const [logs, setLogs] = useState<FinancialAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Temp state for editing
  const [editValue, setEditValue] = useState<string>('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'rules') {
        const data = await PolicyService.getRules();
        setRules(data);
      } else {
        const data = await PolicyService.getAuditLogs();
        setLogs(data);
      }
    } catch (error) {
      alertCompat('Error', 'Failed to load data');

    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRule = async (rule: FinancialPolicyRule) => {
    if (!editValue) return;

    // Validate based on type
    let finalValue: any = editValue;
    if (rule.value_type === 'amount' || rule.value_type === 'percentage') {
      if (isNaN(Number(editValue))) {
        alertCompat('Invalid Input', 'Please enter a valid number');
        return;
      }
      finalValue = { amount: Number(editValue) }; // Standardizing json structure for amount
      // If db stores plain json, we need to respect the existing structure.
      // Our schema says value is JSONB. Let's assume structure { amount: X } or { value: X } or just X.
      // The seed data uses { amount: 1000 } or plain primitives as json? 
      // " '1000'::jsonb " -> this is just number 1000 in json.
      // Wait, the seed said: 'amount', '1000'::jsonb
      // So it's likely just a primitive or a simple object.
      // Let's stick to the convention in check function: current_value->>'amount'.
      // So it expects an object with 'amount' key for amount types!

      if (rule.value_type === 'amount' || rule.value_type === 'percentage') {
        finalValue = { amount: Number(editValue) };
      } else if (rule.value_type === 'boolean') {
        finalValue = { value: editValue === 'true' };
      }
    }

    setUpdating(rule.id);
    try {
      await PolicyService.updateRule(rule.id, finalValue);
      alertCompat('Success', 'Policy updated successfully');
      setEditingRuleId(null);
      loadData();
    } catch (error) {
      alertCompat('Error', 'Failed to update policy');
    } finally {
      setUpdating(null);
    }
  };

  const renderRuleItem = (rule: FinancialPolicyRule) => {
    const isEditing = editingRuleId === rule.id;

    // Helper to display current value safely
    const displayValue = () => {
      if (rule.value_type === 'amount' || rule.value_type === 'percentage') {
        // Check if it's an object with amount or just a number
        return rule.current_value.amount ?? rule.current_value;
      }
      if (rule.value_type === 'boolean') {
        return rule.current_value.value ? 'True' : 'False';
      }
      return JSON.stringify(rule.current_value);
    };

    return (
      <View key={rule.id} style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.ruleName}>{rule.rule_name}</Text>
                    <Text style={styles.ruleCode}>{rule.rule_code}</Text>
                </View>
                <Text style={styles.description}>{rule.description}</Text>
                <View style={styles.valueContainer}>
                    <Text style={styles.label}>Current Limit/Value:</Text>
                    {isEditing ?
          <View style={styles.editContainer}>
                            <AppTextInput
              style={styles.input}
              value={editValue}
              onChangeText={setEditValue}
              placeholder={String(displayValue())}
              placeholderTextColor="#94A3B8"
              keyboardType={rule.value_type === 'amount' ? 'numeric' : 'default'} />

                            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => handleUpdateRule(rule)}
              disabled={!!updating}>

                                {updating === rule.id ?
              <LogoLoader color="#fff" size={30} /> :

              <Text style={styles.btnText}>Save</Text>
              }
                            </TouchableOpacity>
                            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setEditingRuleId(null)}>

                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </View> :

          <View style={styles.displayContainer}>
                            <Text style={styles.valueText}>
                                {rule.value_type === 'amount' ? '₹' : ''}
                                {String(displayValue())}
                                {rule.value_type === 'percentage' ? '%' : ''}
                            </Text>
                            <TouchableOpacity
              onPress={() => {
                setEditingRuleId(rule.id);
                setEditValue(String(displayValue()));
              }}>

                                <Ionicons name="pencil" size={20} color="#666" />
                            </TouchableOpacity>
                        </View>
          }
                </View>
            </View>);

  };

  const renderAuditLog = (log: FinancialAuditLog) =>
  <View key={log.id} style={styles.logCard}>
            <View style={styles.logHeader}>
                <Text style={[styles.actionTag, log.action_type === 'DELETE' ? styles.deleteTag : styles.updateTag]}>
                    {log.action_type}
                </Text>
                <Text style={styles.date}>{new Date(log.performed_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.logDetail}>
                <Text style={styles.bold}>Table:</Text> {log.table_name}
            </Text>
            <Text style={styles.logDetail}>
                <Text style={styles.bold}>User:</Text> {log.performed_by_name}
            </Text>
            <Text style={styles.reasonText}>
                <Text style={styles.bold}>Reason:</Text> {log.reason || 'No reason provided'}
            </Text>
            {log.old_data &&
    <View style={styles.jsonBox}>
                    <Text style={styles.jsonText} numberOfLines={3}>
                        Payload: {JSON.stringify(log.old_data)}
                    </Text>
                </View>
    }
        </View>;

  return (
    <View style={styles.container}>
            <TourTarget id="screen.admin-policy.overview" native><View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Financial Policies & Control</Text>
            </View></TourTarget>
            <TourTarget id="screen.admin-policy.workspace" native><View style={styles.tabBar}>
                <TouchableOpacity
          style={[styles.tab, activeTab === 'rules' && styles.activeTab]}
          onPress={() => setActiveTab('rules')}>

                    <Text style={[styles.tabText, activeTab === 'rules' && styles.activeTabText]}>Policy Rules</Text>
                </TouchableOpacity>
                <TouchableOpacity
          style={[styles.tab, activeTab === 'audit' && styles.activeTab]}
          onPress={() => setActiveTab('audit')}>

                    <Text style={[styles.tabText, activeTab === 'audit' && styles.activeTabText]}>Audit Logs</Text>
                </TouchableOpacity>
            </View></TourTarget>
            {loading ?
      <View style={styles.center}>
                    <LogoLoader size={60} color="#007AFF" />
                </View> :

      <KeyboardAwareScreen variant="scroll" contentContainerStyle={styles.content} bottomOffset={24}>
                    {activeTab === 'rules' ?
        rules.map(renderRuleItem) :

        logs.length > 0 ? logs.map(renderAuditLog) :
        <Text style={styles.emptyText}>No critical actions recorded yet.</Text>

        }
                </KeyboardAwareScreen>
      }
        </View>);

}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent'},
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee', paddingTop: 60 },
  backBtn: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: 'bold' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 10 },
  tab: { marginRight: 20, paddingBottom: 10 },
  activeTab: { borderBottomWidth: 2, borderColor: '#007AFF' },
  tabText: { fontSize: 16, color: '#666' },
  activeTabText: { color: '#007AFF', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  ruleName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  ruleCode: { fontSize: 12, color: '#999' },
  description: { fontSize: 14, color: '#666', marginBottom: 15 },
  valueContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 },
  label: { fontSize: 14, color: '#333' },
  displayContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueText: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  editContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 6, width: 80, textAlign: 'center' },
  saveBtn: { backgroundColor: '#007AFF', padding: 8, borderRadius: 5 },
  btnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cancelBtn: { padding: 8 },
  cancelText: { color: '#666', fontSize: 12 },

  // Audit Logs
  logCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, borderLeftWidth: 4, borderColor: '#ff3b30' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  actionTag: { fontSize: 12, fontWeight: 'bold', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  deleteTag: { backgroundColor: '#ffe5e5', color: '#ff3b30' },
  updateTag: { backgroundColor: '#e5f2ff', color: '#007AFF' },
  date: { fontSize: 12, color: '#999' },
  logDetail: { fontSize: 14, color: '#333', marginBottom: 2 },
  reasonText: { fontSize: 14, color: '#333', marginTop: 5, fontStyle: 'italic' },
  bold: { fontWeight: '600' },
  jsonBox: { backgroundColor: '#f0f0f0', padding: 8, borderRadius: 4, marginTop: 8 },
  jsonText: { fontSize: 10, fontFamily: 'monospace', color: '#555' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 }
});