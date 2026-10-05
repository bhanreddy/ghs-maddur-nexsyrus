import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Linking,
  Modal,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../../src/components/AdminHeader';
import {
  admissionService,
  type PipelineStageGroup,
  type PipelineResponse,
} from '../../../src/services/admissionService';
import type { AdmissionApplication } from '../../../src/types/admission';
import { showAlert } from '../../../src/components/CustomAlert';
import { ClassService, type ClassInfo } from '../../../src/services/classService';
import * as Haptics from '../../../src/utils/haptics';

type ViewMode = 'kanban' | 'list';
type TriageFilter = 'ALL' | 'NEEDS_DECISION' | 'SLA_BREACHED' | 'HIGH_PRIORITY';

export default function AdminAdmissionsPipelineScreen() {
  const router = useRouter();
  const segments = useSegments();
  const isStaffPortal = segments[0] === 'staff';
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;

  // Data Loading
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Classes list for quick filtering
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  // Pipeline Data
  const [pipelineData, setPipelineData] = useState<PipelineResponse | null>(null);
  const [applications, setApplications] = useState<AdmissionApplication[]>([]);
  const [totalApps, setTotalApps] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [triageFilter, setTriageFilter] = useState<TriageFilter>('ALL');

  // Quick Decision Modal State (Principal shortcut)
  const [decisionModalVisible, setDecisionModalVisible] = useState(false);
  const [decisionTargetApp, setDecisionTargetApp] = useState<AdmissionApplication | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<'APPROVED' | 'CONDITIONALLY_APPROVED' | 'WAITLISTED' | 'REJECTED'>('APPROVED');
  const [decisionReason, setDecisionReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Quick Stage Transition Modal State
  const [stageModalVisible, setStageModalVisible] = useState(false);
  const [stageTargetApp, setStageTargetApp] = useState<AdmissionApplication | null>(null);
  const [selectedTargetStage, setSelectedTargetStage] = useState<string>('');
  const [stageRemarks, setStageRemarks] = useState('');
  const [submittingStage, setSubmittingStage] = useState(false);

  // Load Classes on mount
  useEffect(() => {
    ClassService.getClasses()
      .then((clsList) => {
        if (Array.isArray(clsList)) {
          setClasses(clsList);
        }
      })
      .catch(() => {});
  }, []);

  const fetchPipeline = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [pipelineRes, appsRes] = await Promise.all([
          admissionService.getPipeline({
            search: searchQuery || undefined,
            classId: selectedClassId || undefined,
          }),
          admissionService.getApplications({
            search: searchQuery || undefined,
            classId: selectedClassId || undefined,
            limit: 200,
          }),
        ]);

        setPipelineData(pipelineRes);
        setApplications(appsRes.applications || []);
        setTotalApps(appsRes.total || 0);
      } catch (err: any) {
        showAlert({
          title: 'Error Loading Pipeline',
          message: err?.response?.data?.error || err?.message || 'Could not fetch admission pipeline',
          type: 'error',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery, selectedClassId]
  );

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // Aggregate metrics
  const totalCount = pipelineData?.totalCount || totalApps;
  const slaBreachedCount = pipelineData?.slaBreachedCount || applications.filter((a) => a.is_sla_breached).length;

  const needsDecisionCount = useMemo(() => {
    return applications.filter((a) => {
      const isPending = !a.decision || a.decision === 'PENDING';
      const isReviewableStage =
        a.status === 'APPLICATION_UNDER_REVIEW' ||
        a.status === 'INTERVIEW_COMPLETED' ||
        a.status === 'APPLICATION_SUBMITTED' ||
        a.status === 'VERIFICATION_COMPLETED' ||
        (a.current_stage_name && /review|decision|interview|principal/i.test(a.current_stage_name));
      return isPending && isReviewableStage;
    }).length;
  }, [applications]);

  const highPriorityCount = useMemo(() => {
    return applications.filter((a) => a.priority === 'HIGH' || a.priority === 'URGENT').length;
  }, [applications]);

  // Check if an application satisfies the triage filter
  const filterApplication = useCallback(
    (app: AdmissionApplication) => {
      if (triageFilter === 'SLA_BREACHED') {
        return Boolean(app.is_sla_breached);
      }
      if (triageFilter === 'HIGH_PRIORITY') {
        return app.priority === 'HIGH' || app.priority === 'URGENT';
      }
      if (triageFilter === 'NEEDS_DECISION') {
        const isPending = !app.decision || app.decision === 'PENDING';
        const isReviewableStage =
          app.status === 'APPLICATION_UNDER_REVIEW' ||
          app.status === 'INTERVIEW_COMPLETED' ||
          app.status === 'APPLICATION_SUBMITTED' ||
          app.status === 'VERIFICATION_COMPLETED' ||
          (app.current_stage_name && /review|decision|interview|principal/i.test(app.current_stage_name));
        return isPending && isReviewableStage;
      }
      return true;
    },
    [triageFilter]
  );

  // Filtered applications for list view
  const filteredApplications = useMemo(() => {
    return applications.filter(filterApplication);
  }, [applications, filterApplication]);

  // Stages with filtered applications for Kanban view
  const displayStages: PipelineStageGroup[] = useMemo(() => {
    if (!pipelineData?.pipeline) return [];
    return pipelineData.pipeline.map((stage) => {
      const filtered = stage.applications.filter(filterApplication);
      return {
        ...stage,
        count: filtered.length,
        applications: filtered,
      };
    });
  }, [pipelineData, filterApplication]);

  // Quick Communication Actions
  const handleCallParent = (phone?: string) => {
    if (!phone) {
      showAlert({ title: 'No Phone Number', message: 'Parent phone number is not available', type: 'warning' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  };

  const handleWhatsAppParent = (phone?: string, studentName?: string) => {
    if (!phone) {
      showAlert({ title: 'No Phone Number', message: 'Parent phone number is not available', type: 'warning' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const text = encodeURIComponent(
      `Hello from Geethanjali High School regarding ${studentName ? studentName + "'s" : 'the'} admission application.`
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${text}`);
  };

  // Open Quick Decision Modal
  const openDecisionModal = (app: AdmissionApplication) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDecisionTargetApp(app);
    setSelectedDecision('APPROVED');
    setDecisionReason('');
    setDecisionModalVisible(true);
  };

  // Submit Quick Decision
  const handleConfirmDecision = async () => {
    if (!decisionTargetApp) return;
    setSubmittingDecision(true);
    try {
      await admissionService.makeDecision(decisionTargetApp.id, {
        decision: selectedDecision,
        decisionReason: decisionReason.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({
        title: 'Decision Recorded',
        message: `Application marked as ${selectedDecision.replace(/_/g, ' ')}.`,
        type: 'success',
      });
      setDecisionModalVisible(false);
      setDecisionTargetApp(null);
      fetchPipeline(true);
    } catch (err: any) {
      showAlert({
        title: 'Error',
        message: err?.response?.data?.error || err?.message || 'Could not record decision',
        type: 'error',
      });
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Open Quick Stage Transition Modal
  const openStageModal = (app: AdmissionApplication) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStageTargetApp(app);
    setSelectedTargetStage('');
    setStageRemarks('');
    setStageModalVisible(true);
  };

  // Submit Quick Stage Transition
  const handleConfirmStageTransition = async () => {
    if (!stageTargetApp || !selectedTargetStage) return;
    setSubmittingStage(true);
    try {
      await admissionService.transitionStage(
        stageTargetApp.id,
        selectedTargetStage,
        stageRemarks.trim() || 'Stage advanced via principal quick action'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({
        title: 'Stage Updated',
        message: 'The application stage has been updated.',
        type: 'success',
      });
      setStageModalVisible(false);
      setStageTargetApp(null);
      fetchPipeline(true);
    } catch (err: any) {
      showAlert({
        title: 'Error',
        message: err?.response?.data?.error || err?.message || 'Could not update stage',
        type: 'error',
      });
    } finally {
      setSubmittingStage(false);
    }
  };

  // Navigate to Detail
  const navigateToDetail = (appId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const targetUrl = isStaffPortal ? `/staff/admission-detail?id=${appId}` : `/admin/admissions/${appId}`;
    router.push(targetUrl as any);
  };

  // Render Kanban Card
  const renderKanbanCard = (app: AdmissionApplication) => {
    const isBreached = app.is_sla_breached;
    const isHighPriority = app.priority === 'HIGH' || app.priority === 'URGENT';
    const parentPhone = app.father_phone || app.parent_phone || app.mother_phone || app.guardian_phone;
    const parentName = app.father_name || app.mother_name || app.guardian_name;
    const initials = `${(app.student_first_name || 'A')[0]}${(app.student_last_name || '')[0] || ''}`.toUpperCase();

    return (
      <View
        key={app.id}
        style={[
          styles.cardWrapper,
          isBreached && styles.cardWrapperBreached,
          isHighPriority && styles.cardWrapperHighPriority,
        ]}
      >
        {/* Top Header Row */}
        <TouchableOpacity
          style={styles.cardHeaderArea}
          onPress={() => navigateToDetail(app.id)}
          activeOpacity={0.85}
        >
          <View style={styles.cardAvatar}>
            <Text style={styles.cardAvatarText}>{initials}</Text>
          </View>
          <View style={styles.cardHeaderInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardStudentName} numberOfLines={1}>
                {app.student_first_name} {app.student_last_name}
              </Text>
              {isHighPriority && (
                <View style={styles.urgentBadge}>
                  <Ionicons name="flame" size={11} color="#DC2626" />
                  <Text style={styles.urgentBadgeText}>URGENT</Text>
                </View>
              )}
            </View>

            <View style={styles.cardSubInfoRow}>
              <Text style={styles.cardAppNo}>{app.application_no || app.application_number || 'APP-ID'}</Text>
              <View style={styles.classPill}>
                <Text style={styles.classPillText}>{app.class_name || 'Class'}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Parent & Status Information */}
        <View style={styles.cardMetaBlock}>
          {parentName ? (
            <Text style={styles.cardParentName} numberOfLines={1}>
              <Text style={styles.cardLabel}>Parent: </Text>
              {parentName}
            </Text>
          ) : null}

          <View style={styles.cardBadgeRow}>
            {app.decision && app.decision !== 'PENDING' ? (
              <View
                style={[
                  styles.decisionChip,
                  app.decision === 'APPROVED' && styles.decisionChipApproved,
                  app.decision === 'CONDITIONALLY_APPROVED' && styles.decisionChipConditional,
                  app.decision === 'WAITLISTED' && styles.decisionChipWaitlist,
                  app.decision === 'REJECTED' && styles.decisionChipRejected,
                ]}
              >
                <Ionicons
                  name={
                    app.decision === 'APPROVED'
                      ? 'checkmark-circle'
                      : app.decision === 'REJECTED'
                      ? 'close-circle'
                      : 'time-outline'
                  }
                  size={12}
                  color={
                    app.decision === 'APPROVED'
                      ? '#059669'
                      : app.decision === 'REJECTED'
                      ? '#DC2626'
                      : '#D97706'
                  }
                />
                <Text
                  style={[
                    styles.decisionChipText,
                    app.decision === 'APPROVED' && { color: '#059669' },
                    app.decision === 'REJECTED' && { color: '#DC2626' },
                    app.decision === 'WAITLISTED' && { color: '#D97706' },
                  ]}
                >
                  {app.decision.replace(/_/g, ' ')}
                </Text>
              </View>
            ) : null}

            {isBreached && (
              <View style={styles.slaBreachPill}>
                <Ionicons name="alert-circle" size={12} color="#DC2626" />
                <Text style={styles.slaBreachText}>SLA OVERDUE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Action Bar for Principal */}
        <View style={styles.cardActionBar}>
          {parentPhone ? (
            <>
              <TouchableOpacity
                style={styles.cardCallBtn}
                onPress={() => handleCallParent(parentPhone)}
                activeOpacity={0.7}
              >
                <Ionicons name="call" size={13} color="#059669" />
                <Text style={styles.cardCallBtnText}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cardWaBtn}
                onPress={() => handleWhatsAppParent(parentPhone, app.student_first_name)}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                <Text style={styles.cardWaBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.cardNoContact}>No phone provided</Text>
          )}

          <TouchableOpacity
            style={styles.cardDecisionBtn}
            onPress={() => openDecisionModal(app)}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-checkmark" size={13} color="#4F46E5" />
            <Text style={styles.cardDecisionBtnText}>Decision</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardMoreBtn}
            onPress={() => openStageModal(app)}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal" size={15} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Footer date & open arrow */}
        <TouchableOpacity
          style={styles.cardFooterArea}
          onPress={() => navigateToDetail(app.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.cardAppliedDate}>
            {app.created_at ? new Date(app.created_at).toLocaleDateString() : 'Recent'}
          </Text>
          <View style={styles.cardDetailLink}>
            <Text style={styles.cardDetailLinkText}>View Dossier</Text>
            <Ionicons name="chevron-forward" size={13} color="#6366F1" />
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Render List Item
  const renderListItem = (app: AdmissionApplication) => {
    const isBreached = app.is_sla_breached;
    const isHighPriority = app.priority === 'HIGH' || app.priority === 'URGENT';
    const parentPhone = app.father_phone || app.parent_phone || app.mother_phone || app.guardian_phone;
    const initials = `${(app.student_first_name || 'A')[0]}${(app.student_last_name || '')[0] || ''}`.toUpperCase();

    return (
      <View
        key={app.id}
        style={[
          styles.listItemCard,
          isBreached && styles.cardWrapperBreached,
          isHighPriority && styles.cardWrapperHighPriority,
        ]}
      >
        <TouchableOpacity
          style={styles.listItemMain}
          onPress={() => navigateToDetail(app.id)}
          activeOpacity={0.8}
        >
          <View style={styles.listItemAvatar}>
            <Text style={styles.listItemAvatarText}>{initials}</Text>
          </View>

          <View style={styles.listItemContent}>
            <View style={styles.listItemTitleRow}>
              <Text style={styles.listItemName} numberOfLines={1}>
                {app.student_first_name} {app.student_last_name}
              </Text>
              <View style={styles.classPill}>
                <Text style={styles.classPillText}>{app.class_name || 'Class'}</Text>
              </View>
              {isHighPriority && (
                <View style={styles.urgentBadge}>
                  <Ionicons name="flame" size={11} color="#DC2626" />
                  <Text style={styles.urgentBadgeText}>URGENT</Text>
                </View>
              )}
            </View>

            <View style={styles.listItemSubRow}>
              <Text style={styles.listItemAppNo}>{app.application_no || app.application_number || 'APP-ID'}</Text>
              <Text style={styles.listItemPhone}>{parentPhone ? `📞 ${parentPhone}` : 'No phone'}</Text>
            </View>
          </View>

          <View style={styles.listItemRightCol}>
            <View
              style={[
                styles.listStagePill,
                { backgroundColor: app.stage_color ? `${app.stage_color}20` : '#EEF2FF' },
              ]}
            >
              <Text style={[styles.listStageText, { color: app.stage_color || '#4F46E5' }]} numberOfLines={1}>
                {app.current_stage_name || app.status?.replace(/_/g, ' ')}
              </Text>
            </View>

            {isBreached && (
              <View style={styles.slaBreachPill}>
                <Ionicons name="alert-circle" size={11} color="#DC2626" />
                <Text style={styles.slaBreachText}>OVERDUE</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Quick Actions Row */}
        <View style={styles.listItemActionsRow}>
          {parentPhone ? (
            <>
              <TouchableOpacity
                style={styles.cardCallBtn}
                onPress={() => handleCallParent(parentPhone)}
                activeOpacity={0.7}
              >
                <Ionicons name="call" size={13} color="#059669" />
                <Text style={styles.cardCallBtnText}>Call Parent</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cardWaBtn}
                onPress={() => handleWhatsAppParent(parentPhone, app.student_first_name)}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                <Text style={styles.cardWaBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            style={styles.cardDecisionBtn}
            onPress={() => openDecisionModal(app)}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-checkmark" size={13} color="#4F46E5" />
            <Text style={styles.cardDecisionBtnText}>Principal Decision</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardMoreBtn}
            onPress={() => openStageModal(app)}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal" size={15} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-admissions.overview"><AdminHeader
        title="Admission Pipeline"
        showBackButton
        rightAction={{
          icon: 'refresh-outline',
          onPress: () => fetchPipeline(true),
        }}
      /></TourTarget>

      {/* Top Executive Control Bar */}
      <View style={styles.topControlBar}>
        <TourScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionButtonsScroll}
        >
          {/* Primary Action Button */}
          <TouchableOpacity
            style={styles.primaryActionBtnWrapper}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/admission/enquiry');
            }}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryActionGradient}
            >
              <Ionicons name="person-add" size={15} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>New Enquiry</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary Action Buttons */}
          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/admin/admissions/workflow-config' as any);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="options-outline" size={15} color="#4F46E5" />
            <Text style={styles.secondaryActionBtnText}>Workflow Config</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/admin/admissions/analytics' as any);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="stats-chart-outline" size={15} color="#4F46E5" />
            <Text style={styles.secondaryActionBtnText}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              admissionService.exportCsv('applications');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={15} color="#4F46E5" />
            <Text style={styles.secondaryActionBtnText}>Export</Text>
          </TouchableOpacity>
        </TourScrollView>

        {/* View Mode Toggle Pill */}
        <View style={styles.viewModeToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'kanban' && styles.toggleBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode('kanban');
            }}
          >
            <Ionicons
              name="grid-outline"
              size={14}
              color={viewMode === 'kanban' ? '#4F46E5' : '#64748B'}
            />
            <Text style={[styles.toggleBtnText, viewMode === 'kanban' && styles.toggleBtnTextActive]}>
              Pipeline
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode('list');
            }}
          >
            <Ionicons
              name="list-outline"
              size={14}
              color={viewMode === 'list' ? '#4F46E5' : '#64748B'}
            />
            <Text style={[styles.toggleBtnText, viewMode === 'list' && styles.toggleBtnTextActive]}>
              List
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Executive KPI Summary Bar (Compact, Fixed proportions to avoid layout stretching) */}
      <View style={styles.kpiWrapper}>
        <TourScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiScrollContent}
        >
          {/* KPI 1: Total Candidates */}
          <TouchableOpacity
            style={[styles.kpiTile, triageFilter === 'ALL' && styles.kpiTileActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTriageFilter('ALL');
            }}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTileTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="people" size={16} color="#4F46E5" />
              </View>
              <Text style={styles.kpiValueText}>{totalCount}</Text>
            </View>
            <Text style={styles.kpiLabelText}>Total Candidates</Text>
            <Text style={styles.kpiSubText}>All Inquiries</Text>
          </TouchableOpacity>

          {/* KPI 2: Needs Principal Decision */}
          <TouchableOpacity
            style={[
              styles.kpiTile,
              needsDecisionCount > 0 && styles.kpiTileHighlight,
              triageFilter === 'NEEDS_DECISION' && styles.kpiTileActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTriageFilter(triageFilter === 'NEEDS_DECISION' ? 'ALL' : 'NEEDS_DECISION');
            }}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTileTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="flash" size={16} color="#7C3AED" />
              </View>
              <Text style={[styles.kpiValueText, { color: '#7C3AED' }]}>{needsDecisionCount}</Text>
            </View>
            <Text style={[styles.kpiLabelText, { color: '#6D28D9' }]}>Needs Decision</Text>
            <Text style={styles.kpiSubText}>Principal Review</Text>
          </TouchableOpacity>

          {/* KPI 3: SLA Breached / Overdue */}
          <TouchableOpacity
            style={[
              styles.kpiTile,
              slaBreachedCount > 0 && styles.kpiTileBreached,
              triageFilter === 'SLA_BREACHED' && styles.kpiTileActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTriageFilter(triageFilter === 'SLA_BREACHED' ? 'ALL' : 'SLA_BREACHED');
            }}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTileTop}>
              <View
                style={[
                  styles.kpiIconBox,
                  { backgroundColor: slaBreachedCount > 0 ? '#FEE2E2' : '#F1F5F9' },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={slaBreachedCount > 0 ? '#DC2626' : '#64748B'}
                />
              </View>
              <Text
                style={[
                  styles.kpiValueText,
                  { color: slaBreachedCount > 0 ? '#DC2626' : '#0F172A' },
                ]}
              >
                {slaBreachedCount}
              </Text>
            </View>
            <Text
              style={[
                styles.kpiLabelText,
                { color: slaBreachedCount > 0 ? '#B91C1C' : '#64748B' },
              ]}
            >
              SLA Breached
            </Text>
            <Text style={styles.kpiSubText}>Immediate Action</Text>
          </TouchableOpacity>

          {/* KPI 4: High Priority / VIP */}
          <TouchableOpacity
            style={[
              styles.kpiTile,
              highPriorityCount > 0 && styles.kpiTileUrgent,
              triageFilter === 'HIGH_PRIORITY' && styles.kpiTileActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTriageFilter(triageFilter === 'HIGH_PRIORITY' ? 'ALL' : 'HIGH_PRIORITY');
            }}
            activeOpacity={0.8}
          >
            <View style={styles.kpiTileTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="flame" size={16} color="#EA580C" />
              </View>
              <Text style={[styles.kpiValueText, { color: '#EA580C' }]}>{highPriorityCount}</Text>
            </View>
            <Text style={[styles.kpiLabelText, { color: '#C2410C' }]}>High Priority</Text>
            <Text style={styles.kpiSubText}>VIP / Escalated</Text>
          </TouchableOpacity>

          {/* Dynamic Stage Overview Badges */}
          {pipelineData?.pipeline?.slice(0, 3).map((st) => (
            <View key={st.stageId} style={styles.kpiTileStage}>
              <View style={styles.kpiTileTop}>
                <View
                  style={[
                    styles.kpiIconBox,
                    { backgroundColor: st.color ? `${st.color}15` : '#F0FDF4' },
                  ]}
                >
                  <Ionicons name="layers" size={14} color={st.color || '#059669'} />
                </View>
                <Text style={[styles.kpiValueText, { color: st.color || '#059669' }]}>
                  {st.count}
                </Text>
              </View>
              <Text style={styles.kpiLabelText} numberOfLines={1}>
                {st.stageName}
              </Text>
              <Text style={styles.kpiSubText}>In Stage</Text>
            </View>
          ))}
        </TourScrollView>
      </View>

      {/* Class / Grade Filter Bar (Crucial for Principals tracking seat capacity) */}
      <TourTarget id="admin.admissions.filters" native><View style={styles.classFilterBar}>
        <TourScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.classFilterScroll}
        >
          <TouchableOpacity
            style={[
              styles.classChip,
              !selectedClassId && styles.classChipActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedClassId('');
            }}
          >
            <Text
              style={[
                styles.classChipText,
                !selectedClassId && styles.classChipTextActive,
              ]}
            >
              All Grades
            </Text>
          </TouchableOpacity>

          {classes.map((cls) => {
            const isSelected = String(cls.id) === String(selectedClassId);
            return (
              <TouchableOpacity
                key={cls.id}
                style={[styles.classChip, isSelected && styles.classChipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedClassId(isSelected ? '' : String(cls.id));
                }}
              >
                <Text
                  style={[styles.classChipText, isSelected && styles.classChipTextActive]}
                >
                  {cls.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </TourScrollView>
      </View></TourTarget>

      {/* Search & Active Filter Strip */}
      <TourTarget id="screen.admin-admissions.workspace" native><View style={styles.searchBarRow}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
          <TourTarget id="admin.admissions.search" native event="admin.admissions.search"><TextInput
            style={styles.searchInput}
            placeholder="Search candidate name, app no, phone..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => fetchPipeline()}
            returnKeyType="search"
          /></TourTarget>
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Clear Filter Tag if Triage is active */}
        {triageFilter !== 'ALL' && (
          <TouchableOpacity
            style={styles.activeFilterTag}
            onPress={() => setTriageFilter('ALL')}
          >
            <Text style={styles.activeFilterTagText}>
              {triageFilter === 'NEEDS_DECISION'
                ? '⚡ Needs Decision'
                : triageFilter === 'SLA_BREACHED'
                ? '⚠️ SLA Breached'
                : '🔥 High Priority'}
            </Text>
            <Ionicons name="close-circle" size={14} color="#6366F1" />
          </TouchableOpacity>
        )}
      </View></TourTarget>

      {/* Principal Quick Attention Banner */}
      {needsDecisionCount > 0 && triageFilter !== 'NEEDS_DECISION' ? (
        <TouchableOpacity
          style={styles.attentionBanner}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTriageFilter('NEEDS_DECISION');
          }}
          activeOpacity={0.85}
        >
          <View style={styles.attentionBannerLeft}>
            <Ionicons name="shield-checkmark" size={18} color="#6D28D9" />
            <Text style={styles.attentionBannerText}>
              <Text style={{ fontWeight: '800' }}>{needsDecisionCount} Applications</Text> require your
              admission decision.
            </Text>
          </View>
          <View style={styles.attentionBannerBtn}>
            <Text style={styles.attentionBannerBtnText}>Review Now</Text>
            <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Main Content Area */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Updating admission pipeline...</Text>
        </View>
      ) : viewMode === 'kanban' ? (
        /* KANBAN PIPELINE VIEW */
        <TourScrollView
          horizontal
          style={styles.kanbanScroll}
          contentContainerStyle={styles.kanbanContent}
          showsHorizontalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchPipeline(true)} />
          }
        >
          {displayStages.map((stage) => (
            <View key={stage.stageId} style={styles.kanbanColumn}>
              {/* Column Header */}
              <View style={styles.columnHeader}>
                <View style={styles.columnTitleRow}>
                  <View
                    style={[
                      styles.stageColorBar,
                      { backgroundColor: stage.color || '#4F46E5' },
                    ]}
                  />
                  <Text style={styles.columnTitle} numberOfLines={1}>
                    {stage.stageName}
                  </Text>
                </View>
                <View
                  style={[
                    styles.columnBadge,
                    stage.count > 0 && {
                      backgroundColor: stage.color ? `${stage.color}20` : '#EEF2FF',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.columnBadgeText,
                      stage.count > 0 && { color: stage.color || '#4F46E5' },
                    ]}
                  >
                    {stage.count}
                  </Text>
                </View>
              </View>

              {/* Cards Container */}
              <TourScrollView
                style={styles.columnScroll}
                contentContainerStyle={styles.columnCardsContainer}
                showsVerticalScrollIndicator={false}
              >
                {stage.applications.length === 0 ? (
                  <View style={styles.emptyColumn}>
                    <Ionicons name="documents-outline" size={24} color="#CBD5E1" />
                    <Text style={styles.emptyColumnText}>No applications in this stage</Text>
                  </View>
                ) : (
                  stage.applications.map((app) => renderKanbanCard(app))
                )}
              </TourScrollView>
            </View>
          ))}
        </TourScrollView>
      ) : (
        /* LIST VIEW */
        <TourScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchPipeline(true)} />
          }
        >
          {filteredApplications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Applications Found</Text>
              <Text style={styles.emptySubtitle}>
                Try adjusting your search query or triage filters.
              </Text>
            </View>
          ) : (
            filteredApplications.map((app) => renderListItem(app))
          )}
        </TourScrollView>
      )}

      {/* QUICK DECISION MODAL FOR PRINCIPALS */}
      <Modal
        visible={decisionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDecisionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.decisionModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Principal Admission Decision</Text>
                <Text style={styles.modalSubtitle}>
                  {decisionTargetApp?.student_first_name} {decisionTargetApp?.student_last_name} •{' '}
                  {decisionTargetApp?.class_name || 'Class'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDecisionModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.decisionSectionLabel}>Select Decision:</Text>
            <View style={styles.decisionChoices}>
              {[
                {
                  id: 'APPROVED',
                  label: 'Approve Admission',
                  sub: 'Offer seat and trigger admission fee',
                  icon: 'checkmark-circle',
                  color: '#059669',
                  bg: '#ECFDF5',
                  border: '#A7F3D0',
                },
                {
                  id: 'CONDITIONALLY_APPROVED',
                  label: 'Conditional Approval',
                  sub: 'Subject to verification or documents',
                  icon: 'alert-circle',
                  color: '#D97706',
                  bg: '#FFFBEB',
                  border: '#FDE68A',
                },
                {
                  id: 'WAITLISTED',
                  label: 'Waitlist Candidate',
                  sub: 'Place in waitlist queue',
                  icon: 'time',
                  color: '#4F46E5',
                  bg: '#EEF2FF',
                  border: '#C7D2FE',
                },
                {
                  id: 'REJECTED',
                  label: 'Reject Application',
                  sub: 'Candidate does not meet criteria',
                  icon: 'close-circle',
                  color: '#DC2626',
                  bg: '#FEF2F2',
                  border: '#FECACA',
                },
              ].map((opt) => {
                const isSelected = selectedDecision === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.decisionOptionCard,
                      isSelected && {
                        borderColor: opt.color,
                        backgroundColor: opt.bg,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDecision(opt.id as any);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={opt.icon as any} size={20} color={opt.color} />
                    <View style={styles.decisionOptionTextCol}>
                      <Text style={[styles.decisionOptionLabel, { color: opt.color }]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.decisionOptionSub}>{opt.sub}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="radio-button-on" size={18} color={opt.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.decisionSectionLabel}>Remarks / Conditions (Optional):</Text>
            <TextInput
              style={styles.decisionTextInput}
              placeholder="e.g. Cleared interview with grade A; pending original TC submission."
              placeholderTextColor="#94A3B8"
              value={decisionReason}
              onChangeText={setDecisionReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalFooterBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDecisionModalVisible(false)}
                disabled={submittingDecision}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleConfirmDecision}
                disabled={submittingDecision}
              >
                {submittingDecision ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitBtnText}>Confirm Decision</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QUICK STAGE TRANSITION MODAL */}
      <Modal
        visible={stageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.decisionModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Move Pipeline Stage</Text>
                <Text style={styles.modalSubtitle}>
                  {stageTargetApp?.student_first_name} {stageTargetApp?.student_last_name} •{' '}
                  {stageTargetApp?.application_no || stageTargetApp?.application_number}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setStageModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.decisionSectionLabel}>Select Target Stage:</Text>
            <TourScrollView style={{ maxHeight: 220 }}>
              {pipelineData?.pipeline?.map((stage) => {
                const isSelected = selectedTargetStage === stage.stageCode || selectedTargetStage === stage.stageName;
                return (
                  <TouchableOpacity
                    key={stage.stageId}
                    style={[
                      styles.stageChoiceRow,
                      isSelected && styles.stageChoiceRowSelected,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedTargetStage(stage.stageCode || stage.stageName);
                    }}
                  >
                    <View
                      style={[
                        styles.stageDot,
                        { backgroundColor: stage.color || '#4F46E5' },
                      ]}
                    />
                    <Text style={styles.stageChoiceName}>{stage.stageName}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color="#4F46E5" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </TourScrollView>

            <Text style={[styles.decisionSectionLabel, { marginTop: 12 }]}>Transition Notes:</Text>
            <TextInput
              style={styles.decisionTextInput}
              placeholder="e.g. Moved after physical document inspection"
              placeholderTextColor="#94A3B8"
              value={stageRemarks}
              onChangeText={setStageRemarks}
            />

            <View style={styles.modalFooterBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setStageModalVisible(false)}
                disabled={submittingStage}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  !selectedTargetStage && { opacity: 0.6 },
                ]}
                onPress={handleConfirmStageTransition}
                disabled={submittingStage || !selectedTargetStage}
              >
                {submittingStage ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitBtnText}>Move Stage</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  topControlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  actionButtonsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  primaryActionBtnWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  secondaryActionBtnText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  toggleBtnTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },

  // KPI Section (Fixed proportions)
  kpiWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  kpiScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
  },
  kpiTile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 126,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiTileActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
  },
  kpiTileHighlight: {
    borderColor: '#DDD6FE',
    backgroundColor: '#FDFCFF',
  },
  kpiTileBreached: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  kpiTileUrgent: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFBF5',
  },
  kpiTileStage: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiValueText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  kpiSubText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Class Filter Bar
  classFilterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
  },
  classFilterScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  classChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  classChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  classChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Search Bar
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  activeFilterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  activeFilterTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },

  // Principal Attention Banner
  attentionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  attentionBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  attentionBannerText: {
    fontSize: 12,
    color: '#4C1D95',
  },
  attentionBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6D28D9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  attentionBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Kanban Pipeline View
  kanbanScroll: {
    flex: 1,
  },
  kanbanContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  kanbanColumn: {
    width: 300,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 12,
    maxHeight: '100%',
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  columnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  stageColorBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  columnTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    flex: 1,
  },
  columnBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  columnBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  columnScroll: {
    flex: 1,
  },
  columnCardsContainer: {
    gap: 12,
    paddingBottom: 16,
  },
  emptyColumn: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 6,
  },
  emptyColumnText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // Executive Candidate Card
  cardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardWrapperBreached: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  cardWrapperHighPriority: {
    borderColor: '#FDBA74',
  },
  cardHeaderArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  cardAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardStudentName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  urgentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },
  cardSubInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  cardAppNo: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  classPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  classPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  cardMetaBlock: {
    marginTop: 8,
  },
  cardParentName: {
    fontSize: 11,
    color: '#475569',
  },
  cardLabel: {
    fontWeight: '600',
    color: '#64748B',
  },
  cardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  decisionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  decisionChipApproved: {
    backgroundColor: '#ECFDF5',
  },
  decisionChipConditional: {
    backgroundColor: '#FFFBEB',
  },
  decisionChipWaitlist: {
    backgroundColor: '#EEF2FF',
  },
  decisionChipRejected: {
    backgroundColor: '#FEF2F2',
  },
  decisionChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  slaBreachPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  slaBreachText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },

  // One-Tap Action Bar on Cards
  cardActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardCallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  cardWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardWaBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  cardDecisionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardDecisionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  cardMoreBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardNoContact: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
    flex: 1,
  },
  cardFooterArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  cardAppliedDate: {
    fontSize: 10,
    color: '#94A3B8',
  },
  cardDetailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardDetailLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
  },

  // List View Styles
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  listItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  listItemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  listItemAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4F46E5',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  listItemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  listItemAppNo: {
    fontSize: 11,
    color: '#64748B',
  },
  listItemPhone: {
    fontSize: 11,
    color: '#475569',
  },
  listItemRightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  listStagePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: 110,
  },
  listStageText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listItemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  decisionModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  decisionSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 6,
  },
  decisionChoices: {
    gap: 8,
    marginBottom: 12,
  },
  decisionOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  decisionOptionTextCol: {
    flex: 1,
  },
  decisionOptionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  decisionOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  decisionTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 16,
  },
  modalFooterBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalSubmitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Stage choice rows
  stageChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 4,
    backgroundColor: '#F8FAFC',
  },
  stageChoiceRowSelected: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageChoiceName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
});
