import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GovernanceService, AuditLogItem } from '../../src/services/governanceService';

export default function AuditExplorerScreen() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await GovernanceService.getAuditLogs({
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
        limit: 50,
      });
      setLogs(res.rows || []);
      setTotalCount(res.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TourScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <TourTarget id="screen.admin-audit-explorer.overview" native><View style={styles.header}>
          <View>
            <Text style={styles.pageTitle}>Forensic Audit Explorer</Text>
            <Text style={styles.pageSubtitle}>
              Immutable unified event trail of operational and financial actions. Sensitive credentials and PII are masked.
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchLogs}>
            <Ionicons name="refresh" size={16} color="#475569" />
            <Text style={styles.refreshBtnText}>Reload</Text>
          </TouchableOpacity>
        </View></TourTarget>

        {/* Filters */}
        <View style={styles.filterCard}>
          <TourTarget id="screen.admin-audit-explorer.workspace" native><View style={styles.filterRow}>
            <View style={styles.filterItem}>
              <Text style={styles.filterLabel}>Filter by Action</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="e.g. marks.revision, fees.collect"
                placeholderTextColor="#94a3b8"
                value={actionFilter}
                onChangeText={setActionFilter}
              />
            </View>
            <View style={styles.filterItem}>
              <Text style={styles.filterLabel}>Filter by Entity</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="e.g. exam_marks, students"
                placeholderTextColor="#94a3b8"
                value={entityFilter}
                onChangeText={setEntityFilter}
              />
            </View>
          </View></TourTarget>
          <View style={styles.quickFilterRow}>
            {['', 'marks.revision', 'fees.collect', 'admission.document_reminder_attempt', 'approval.approved'].map((act) => (
              <TouchableOpacity
                key={act || 'all'}
                style={[styles.chip, actionFilter === act && styles.chipActive]}
                onPress={() => setActionFilter(act)}
              >
                <Text style={[styles.chipText, actionFilter === act && styles.chipTextActive]}>
                  {act ? act.replace('.', ' ') : 'All Actions'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Log Entries */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>Audit Entries ({totalCount})</Text>
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading forensic trail...</Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Audit Records Found</Text>
            <Text style={styles.emptySubtitle}>No operations matched the specified filters.</Text>
          </View>
        ) : (
          logs.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <View key={item.id} style={styles.logCard}>
                <TouchableOpacity
                  style={styles.logHeader}
                  onPress={() => toggleExpand(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.logLeft}>
                    <View style={styles.actionRow}>
                      <Text style={styles.actionName}>{item.action}</Text>
                      <View
                        style={[
                          styles.sourceTag,
                          {
                            backgroundColor: item.source === 'financial' ? '#fef3c7' : '#e0e7ff',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sourceTagText,
                            {
                              color: item.source === 'financial' ? '#b45309' : '#3730a3',
                            },
                          ]}
                        >
                          {item.source.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="person-circle-outline" size={14} color="#64748b" />
                      <Text style={styles.metaText}>
                        {item.actor_name} ({item.actor_role})
                      </Text>
                      <Text style={styles.metaDivider}>•</Text>
                      <Ionicons name="time-outline" size={14} color="#64748b" />
                      <Text style={styles.metaText}>
                        {new Date(item.timestamp).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </Text>
                      <Text style={styles.metaDivider}>•</Text>
                      <Text style={styles.metaText}>
                        {item.entity}:{item.entity_id ? item.entity_id.slice(0, 8) : 'N/A'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>

                {/* Diff view */}
                {isExpanded && (
                  <View style={styles.diffContainer}>
                    {item.old_data && (
                      <View style={styles.diffCol}>
                        <Text style={styles.diffColHeader}>Previous State (Before)</Text>
                        <View style={styles.codeBlock}>
                          <Text style={styles.codeText}>
                            {JSON.stringify(item.old_data, null, 2)}
                          </Text>
                        </View>
                      </View>
                    )}
                    {item.new_data && (
                      <View style={styles.diffCol}>
                        <Text style={[styles.diffColHeader, { color: '#16a34a' }]}>
                          Updated State (After)
                        </Text>
                        <View style={styles.codeBlock}>
                          <Text style={styles.codeText}>
                            {JSON.stringify(item.new_data, null, 2)}
                          </Text>
                        </View>
                      </View>
                    )}
                    {!item.old_data && !item.new_data && (
                      <Text style={styles.noDiffText}>No state mutations recorded for this event.</Text>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </TourScrollView>
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
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    maxWidth: 680,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  filterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  filterInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listHeaderRow: {
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  logLeft: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  sourceTag: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 4,
  },
  metaDivider: {
    marginHorizontal: 8,
    color: '#cbd5e1',
  },
  diffContainer: {
    backgroundColor: '#f8fafc',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    gap: 12,
  },
  diffCol: {
    flex: 1,
  },
  diffColHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 6,
  },
  codeBlock: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 10,
    maxHeight: 220,
  },
  codeText: {
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  noDiffText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});
