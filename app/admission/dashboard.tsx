import { AppTourQuickAction, TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  admissionService,
  type MyApplicationResponse,
} from '../../src/services/admissionService';
import { AuthService } from '../../src/services/authService';
import { showAlert } from '../../src/components/CustomAlert';
import ApplicantApplicationWizard from '../../src/components/admission/ApplicantApplicationWizard';

type TabKey = 'overview' | 'form' | 'documents' | 'interview' | 'messages';

export default function ApplicantDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<MyApplicationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Document upload modal state
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>('');
  const [selectedDocTitle, setSelectedDocTitle] = useState<string>('');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Message compose state
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const fetchApplicationData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await admissionService.getMyApplication();
      setData(res);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        router.replace('/admission/login');
      } else {
        showAlert({
          title: 'Unable to Load Application',
          message: err?.response?.data?.error || err?.message || 'Could not fetch admission record.',
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    fetchApplicationData();
  }, [fetchApplicationData]);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setUploadingDoc(true);

      // On web, read asset file directly
      let base64Data = '';
      if (Platform.OS === 'web' && (asset as any).file) {
        const file = (asset as any).file;
        const reader = new FileReader();
        base64Data = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else {
        const FileSystem = await import('expo-file-system');
        const raw = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: 'base64' as any,
        });
        base64Data = `data:${asset.mimeType || 'application/pdf'};base64,${raw}`;
      }

      await admissionService.uploadMyDocument({
        documentType: selectedDocType,
        title: selectedDocTitle || selectedDocType,
        base64: base64Data,
        fileName: asset.name,
        mimeType: asset.mimeType || 'application/pdf',
      });

      showAlert({
        title: 'Document Uploaded',
        message: `${selectedDocTitle || selectedDocType} uploaded successfully.`,
        type: 'success',
      });

      setUploadModalVisible(false);
      fetchApplicationData();
    } catch (err: any) {
      showAlert({
        title: 'Upload Failed',
        message: err?.response?.data?.error || err?.message || 'Could not upload document.',
        type: 'error',
      });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showAlert({
          title: 'Permission Denied',
          message: 'Please enable photo library access to upload photos.',
          type: 'warning',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setUploadingDoc(true);

      const base64Data = asset.base64
        ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;

      await admissionService.uploadMyDocument({
        documentType: selectedDocType,
        title: selectedDocTitle || selectedDocType,
        base64: base64Data,
        fileName: asset.fileName || `${selectedDocType}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });

      showAlert({
        title: 'Document Uploaded',
        message: `${selectedDocTitle || selectedDocType} uploaded successfully.`,
        type: 'success',
      });

      setUploadModalVisible(false);
      fetchApplicationData();
    } catch (err: any) {
      showAlert({
        title: 'Upload Failed',
        message: err?.response?.data?.error || err?.message || 'Could not upload photo.',
        type: 'error',
      });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageBody.trim()) {
      showAlert({ title: 'Message Empty', message: 'Please enter your message.', type: 'warning' });
      return;
    }

    setSendingMessage(true);
    try {
      if (!data?.application?.id) throw new Error('Application ID missing');
      await admissionService.sendMyMessage(
        messageSubject.trim() || 'Parent Query',
        messageBody.trim()
      );
      showAlert({
        title: 'Message Sent',
        message: 'Your message has been delivered to the admissions office.',
        type: 'success',
      });
      setMessageSubject('');
      setMessageBody('');
      fetchApplicationData();
    } catch (err: any) {
      showAlert({
        title: 'Failed to Send',
        message: err?.response?.data?.error || err?.message || 'Could not send message.',
        type: 'error',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleWithdraw = () => {
    showAlert({
      title: 'Withdraw application?',
      message: 'This will mark your application as withdrawn. The school will keep a record for audit.',
      type: 'warning',
      buttons: [
        { text: 'Keep Application', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await admissionService.withdrawMyApplication('Withdrawn by applicant');
              fetchApplicationData();
            } catch (err: any) {
              showAlert({
                title: 'Could not withdraw',
                message: err?.response?.data?.error || err?.message || 'Please try again.',
                type: 'error',
              });
            }
          },
        },
      ],
    });
  };

  const handleSignOut = async () => {
    try {
      await AuthService.signOut();
      router.replace('/admission/login');
    } catch {
      router.replace('/admission/login');
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: '#F8FAFC' }]}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Loading your admission application...</Text>
      </View>
    );
  }

  const app = data?.application;
  const isDraft = !app?.status || (app?.status as any) === 'DRAFT' || app?.status === 'APPLICATION_STARTED' || app?.status === 'APPLICATION_INCOMPLETE' || app?.status === 'ENQUIRY_CREATED';
  const isConverted = app?.status === 'CONVERTED_TO_STUDENT';
  const nextAction = data?.smartNextAction;

  return (
    <TourTarget id="screen.admission-dashboard.overview" native><View style={styles.container}>
      {/* Top Gradient Header */}
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#0F766E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerAppBadge}>
              {app?.application_no || app?.application_number || 'Admission Portal'}
            </Text>
            <Text style={styles.headerStudentName}>
              {app?.student_first_name} {app?.student_last_name}
            </Text>
            <Text style={styles.headerMeta}>
              Grade: {app?.class_name || 'Not selected'} • {app?.academic_year_name || 'Academic Year'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#E2E8F0" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Stage Status Pill */}
        <View style={styles.stageStatusRow}>
          <View
            style={[
              styles.stageBadge,
              { backgroundColor: isConverted ? '#059669' : app?.stage_color || '#0D9488' },
            ]}
          >
            <Ionicons
              name={isConverted ? 'checkmark-circle' : 'time-outline'}
              size={14}
              color="#FFFFFF"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.stageBadgeText}>
              {isConverted ? 'ADMISSION CONFIRMED' : app?.current_stage_name || app?.status || 'In Review'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Smart Next Action Banner */}
      {nextAction && (
        <View
          style={[
            styles.nextActionCard,
            isConverted ? styles.nextActionConfirmed : styles.nextActionPending,
          ]}
        >
          <Ionicons
            name={isConverted ? 'ribbon' : 'alert-circle'}
            size={24}
            color={isConverted ? '#047857' : '#0F766E'}
          />
          <View style={styles.nextActionTextCol}>
            <Text style={[styles.nextActionTitle, isConverted && { color: '#065F46' }]}>
              {nextAction.title}
            </Text>
            <Text style={styles.nextActionDesc}>{nextAction.description}</Text>
          </View>
          {(nextAction.actionKey === 'UPLOAD_DOCUMENT' || nextAction.actionKey === 'UPLOAD_DOCS' || nextAction.actionKey === 'REUPLOAD_DOCUMENT') ? (
            <TouchableOpacity
              style={styles.nextActionBtn}
              onPress={() => setActiveTab('documents')}
            >
              <Text style={styles.nextActionBtnText}>Upload</Text>
            </TouchableOpacity>
          ) : null}
          {nextAction.actionKey === 'COMPLETE_FORM' && (
            <TouchableOpacity
              style={styles.nextActionBtn}
              onPress={() => setActiveTab('form')}
            >
              <Text style={styles.nextActionBtnText}>Continue</Text>
            </TouchableOpacity>
          )}
          {nextAction.actionKey === 'VIEW_INTERVIEW' && (
            <TouchableOpacity
              style={styles.nextActionBtn}
              onPress={() => setActiveTab('interview')}
            >
              <Text style={styles.nextActionBtnText}>Details</Text>
            </TouchableOpacity>
          )}
          {nextAction.actionKey === 'OPEN_PORTAL' && (
            <TouchableOpacity
              style={styles.nextActionBtn}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.nextActionBtnText}>Open SchoolIMS</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tabs Navigation */}
      <TourTarget id="applicant.navigation" native><TourTarget id="screen.admission-dashboard.workspace" native><View style={styles.tabBar}>
        <TourTarget id="applicant.overview.tab" native event="applicant.overview.tab"><TouchableOpacity
          style={[styles.tabItem, activeTab === 'overview' && styles.tabItemActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons
            name="pie-chart-outline"
            size={18}
            color={activeTab === 'overview' ? '#0F766E' : '#64748B'}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'overview' && styles.tabLabelActive]}
          >
            Overview
          </Text>
        </TouchableOpacity></TourTarget>

        <TourTarget id="applicant.form.tab" native event="applicant.form.tab"><TouchableOpacity
          style={[styles.tabItem, activeTab === 'form' && styles.tabItemActive]}
          onPress={() => setActiveTab('form')}
        >
          <Ionicons
            name="create-outline"
            size={18}
            color={activeTab === 'form' ? '#0F766E' : '#64748B'}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'form' && styles.tabLabelActive]}
          >
            Application
          </Text>
        </TouchableOpacity></TourTarget>

        <TourTarget id="applicant.documents.tab" native event="applicant.documents.tab"><TouchableOpacity
          style={[styles.tabItem, activeTab === 'documents' && styles.tabItemActive]}
          onPress={() => setActiveTab('documents')}
        >
          <Ionicons
            name="documents-outline"
            size={18}
            color={activeTab === 'documents' ? '#0F766E' : '#64748B'}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'documents' && styles.tabLabelActive]}
          >
            Docs ({data?.documentChecklist?.verifiedDocuments || 0}/{data?.documentChecklist?.requiredDocuments || 0})
          </Text>
        </TouchableOpacity></TourTarget>

        <TourTarget id="applicant.interview.tab" native event="applicant.interview.tab"><TouchableOpacity
          style={[styles.tabItem, activeTab === 'interview' && styles.tabItemActive]}
          onPress={() => setActiveTab('interview')}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={activeTab === 'interview' ? '#0F766E' : '#64748B'}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'interview' && styles.tabLabelActive]}
          >
            Interview
          </Text>
        </TouchableOpacity></TourTarget>

        <TourTarget id="applicant.messages.tab" native event="applicant.messages.tab"><TouchableOpacity
          style={[styles.tabItem, activeTab === 'messages' && styles.tabItemActive]}
          onPress={() => setActiveTab('messages')}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={18}
            color={activeTab === 'messages' ? '#0F766E' : '#64748B'}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'messages' && styles.tabLabelActive]}
          >
            Messages
          </Text>
        </TouchableOpacity></TourTarget>
      </View></TourTarget></TourTarget>

      {/* Main Tab Content */}
      <TourScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchApplicationData(true)} />
        }
      >
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <TourTarget id="applicant.overview.content" native><View style={styles.tabContent}>
            {/* Conversion Success Trophy Card */}
            {isConverted && (
              <View style={styles.trophyCard}>
                <LinearGradient
                  colors={['#065F46', '#047857']}
                  style={styles.trophyGradient}
                >
                  <Ionicons name="school" size={48} color="#A7F3D0" />
                  <Text style={styles.trophyTitle}>Welcome to the Family!</Text>
                  <Text style={styles.trophySubtitle}>
                    Official Student Admission No:
                  </Text>
                  <View style={styles.admissionNoPill}>
                    <Text style={styles.admissionNoText}>{app?.converted_admission_no}</Text>
                  </View>
                  <Text style={styles.trophyNote}>
                    Your student record and academic profile are now active. You can switch to the Student/Parent Portal using your registered email.
                  </Text>
                </LinearGradient>
              </View>
            )}

            {/* Application Progress Summary */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Admission Progress</Text>
              <Text style={styles.progressPct}>{data?.progressPercent ?? 0}%</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, data?.progressPercent || 0)}%` }]} />
              </View>
              <View style={styles.stepperContainer}>
                {(data?.workflowTimeline || [
                  { name: 'Enquiry', state: 'done' },
                  { name: 'Application', state: isDraft ? 'current' : 'done' },
                  { name: 'Documents', state: (data?.documentChecklist?.pendingDocuments || 0) === 0 ? 'done' : 'upcoming' },
                  { name: 'Decision', state: app?.decision_status === 'APPROVED' || isConverted ? 'done' : 'upcoming' },
                  { name: 'Enrolled', state: isConverted ? 'done' : 'upcoming' },
                ]).map((step: any, idx: number) => (
                  <View key={step.code || step.name || idx} style={styles.stepItem}>
                    <View
                      style={[
                        styles.stepCircle,
                        step.state === 'done' || step.done ? styles.stepCircleDone : step.state === 'current' ? styles.stepCircleCurrent : styles.stepCirclePending,
                      ]}
                    >
                      {step.state === 'done' || step.done ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : (
                        <Text style={styles.stepNumber}>{idx + 1}</Text>
                      )}
                    </View>
                    <Text style={styles.stepLabel}>{step.name || step.title}</Text>
                  </View>
                ))}
              </View>
            </View>

            {isDraft && app?.status !== 'WITHDRAWN' ? (
              <TouchableOpacity onPress={handleWithdraw} style={{ alignSelf: 'center', paddingVertical: 8, marginBottom: 8 }}>
                <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600' }}>Withdraw this application</Text>
              </TouchableOpacity>
            ) : null}

            {/* Quick Metrics Grid */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricVal}>
                  {data?.documentChecklist?.verifiedDocuments || 0} / {data?.documentChecklist?.requiredDocuments || 0}
                </Text>
                <Text style={styles.metricLabel}>Docs Verified</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricVal}>
                  {data?.interviews?.length || 0}
                </Text>
                <Text style={styles.metricLabel}>Interviews</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={[styles.metricVal, { color: app?.decision_status === 'APPROVED' ? '#059669' : '#0F766E' }]}>
                  {app?.decision_status || 'PENDING'}
                </Text>
                <Text style={styles.metricLabel}>School Decision</Text>
              </View>
            </View>

            {/* Timeline Audit Entries */}
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Activity & Timeline</Text>
              {(data?.timeline || []).length === 0 ? (
                <Text style={styles.emptyNote}>No activity logged yet.</Text>
              ) : (
                data?.timeline.map((entry, idx) => (
                  <View key={entry.id || idx} style={styles.timelineRow}>
                    <View style={styles.timelineDot} />
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineStage}>
                        Stage: {entry.stage_name || entry.to_status}
                      </Text>
                      {entry.remarks ? (
                        <Text style={styles.timelineRemarks}>{entry.remarks}</Text>
                      ) : null}
                      <Text style={styles.timelineDate}>
                        {new Date(entry.entered_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View></TourTarget>
        )}

        {/* TAB 2: APPLICATION FORM */}
        {activeTab === 'form' && app && (
          <TourTarget id="applicant.form.content" native><View style={styles.tabContent}>
            <ApplicantApplicationWizard
              application={app}
              isDraft={isDraft}
              onSaved={() => fetchApplicationData()}
              onSubmitted={() => fetchApplicationData()}
            />
          </View></TourTarget>
        )}

        {/* TAB 3: DOCUMENTS CHECKLIST */}
        {activeTab === 'documents' && (
          <TourTarget id="applicant.documents.content" native><View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Document Verification Checklist</Text>
              <Text style={styles.cardSubtitle}>
                Please upload legible copies of the required certificates. Rejected documents must be replaced promptly.
              </Text>

              {data?.documentChecklist?.checklist.map((item) => {
                const uploaded = item.uploadedDoc || item.document;
                const isRejected = item.status === 'REJECTED' || uploaded?.status === 'REJECTED';
                const isVerified = item.status === 'VERIFIED' || uploaded?.status === 'VERIFIED';
                const isUploaded = Boolean(uploaded);

                return (
                  <View
                    key={item.documentType}
                    style={[
                      styles.docItemCard,
                      isRejected && styles.docItemRejected,
                      isVerified && styles.docItemVerified,
                    ]}
                  >
                    <View style={styles.docItemLeft}>
                      <View
                        style={[
                          styles.docIconPill,
                          isVerified
                            ? styles.docIconVerified
                            : isRejected
                            ? styles.docIconRejected
                            : styles.docIconPending,
                        ]}
                      >
                        <Ionicons
                          name={
                            isVerified
                              ? 'checkmark-circle'
                              : isRejected
                              ? 'close-circle'
                              : 'document-text-outline'
                          }
                          size={20}
                          color={isVerified ? '#059669' : isRejected ? '#DC2626' : '#0F766E'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docItemTitle}>
                          {item.displayName || item.title} {item.isMandatory ? '*' : ''}
                        </Text>
                        <Text style={styles.docItemMeta}>
                          {item.description || item.documentType}
                        </Text>
                        {isRejected && uploaded?.rejection_reason ? (
                          <View style={styles.rejectionBox}>
                            <Text style={styles.rejectionReasonText}>
                              Reason: {uploaded.rejection_reason}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.docItemActionCol}>
                      <View
                        style={[
                          styles.docStatusBadge,
                          isVerified
                            ? styles.docBadgeVerified
                            : isRejected
                            ? styles.docBadgeRejected
                            : isUploaded
                            ? styles.docBadgeUploaded
                            : styles.docBadgeMissing,
                        ]}
                      >
                        <Text
                          style={[
                            styles.docStatusBadgeText,
                            isVerified
                              ? { color: '#065F46' }
                              : isRejected
                              ? { color: '#991B1B' }
                              : isUploaded
                              ? { color: '#1E40AF' }
                              : { color: '#64748B' },
                          ]}
                        >
                          {isVerified
                            ? 'VERIFIED'
                            : isRejected
                            ? 'REJECTED'
                            : isUploaded
                            ? 'SUBMITTED'
                            : 'PENDING'}
                        </Text>
                      </View>

                      {!isVerified && (
                        <TouchableOpacity
                          style={[
                            styles.uploadDocBtn,
                            isRejected && styles.replaceDocBtn,
                          ]}
                          onPress={() => {
                            setSelectedDocType(item.documentType);
                            setSelectedDocTitle(item.displayName || item.title || item.documentType);
                            setUploadModalVisible(true);
                          }}
                        >
                          <Ionicons
                            name={isRejected ? 'refresh-outline' : 'cloud-upload-outline'}
                            size={14}
                            color={isRejected ? '#DC2626' : '#0F766E'}
                          />
                          <Text
                            style={[
                              styles.uploadDocBtnText,
                              isRejected && { color: '#DC2626' },
                            ]}
                          >
                            {isRejected ? 'Replace' : isUploaded ? 'Update' : 'Upload'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View></TourTarget>
        )}

        {/* TAB 4: INTERVIEW & ENTRANCE TEST */}
        {activeTab === 'interview' && (
          <TourTarget id="applicant.interview.content" native><View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Interview & Assessment Schedule</Text>
              {(data?.interviews || []).length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-clear-outline" size={48} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No Interviews Scheduled</Text>
                  <Text style={styles.emptySubtitle}>
                    When the admissions team schedules an interaction or entrance assessment, details will appear here.
                  </Text>
                </View>
              ) : (
                data?.interviews.map((item) => (
                  <View key={item.id} style={styles.interviewCard}>
                    <View style={styles.interviewHeader}>
                      <Text style={styles.interviewTitle}>{item.title}</Text>
                      <View style={styles.interviewModePill}>
                        <Text style={styles.interviewModeText}>{item.mode || 'OFFLINE'}</Text>
                      </View>
                    </View>

                    <View style={styles.interviewDetailRow}>
                      <Ionicons name="calendar-outline" size={16} color="#64748B" />
                      <Text style={styles.interviewDetailText}>
                        {new Date(item.scheduled_date).toLocaleDateString()} ({item.start_time} - {item.end_time})
                      </Text>
                    </View>

                    {item.location ? (
                      <View style={styles.interviewDetailRow}>
                        <Ionicons name="location-outline" size={16} color="#64748B" />
                        <Text style={styles.interviewDetailText}>{item.location}</Text>
                      </View>
                    ) : null}

                    {item.online_meeting_url ? (
                      <View style={styles.interviewDetailRow}>
                        <Ionicons name="videocam-outline" size={16} color="#0D9488" />
                        <Text style={[styles.interviewDetailText, { color: '#0D9488' }]}>
                          Meeting: {item.online_meeting_url}
                        </Text>
                      </View>
                    ) : null}

                    {item.feedback ? (
                      <View style={styles.feedbackBox}>
                        <Text style={styles.feedbackLabel}>Evaluator Feedback:</Text>
                        <Text style={styles.feedbackText}>{item.feedback}</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </View></TourTarget>
        )}

        {/* TAB 5: MESSAGES */}
        {activeTab === 'messages' && (
          <TourTarget id="applicant.messages.content" native><View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Admissions Office Communication</Text>

              {/* Compose message */}
              <View style={styles.composeBox}>
                <Text style={styles.label}>Ask a Question / Send Note to Admissions</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Subject (e.g. Query regarding fee payment)"
                  value={messageSubject}
                  onChangeText={setMessageSubject}
                />
                <TextInput
                  style={[styles.input, { height: 72, marginTop: 8 }]}
                  placeholder="Type your message here..."
                  multiline
                  value={messageBody}
                  onChangeText={setMessageBody}
                />
                <TouchableOpacity
                  style={styles.sendMsgBtn}
                  onPress={handleSendMessage}
                  disabled={sendingMessage}
                >
                  {sendingMessage ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.sendMsgBtnText}>Send Message</Text>
                      <Ionicons name="send" size={14} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Message thread */}
              <Text style={[styles.subHeading, { marginTop: 24, marginBottom: 12 }]}>
                Conversation History
              </Text>
              {(data?.messages || []).length === 0 ? (
                <Text style={styles.emptyNote}>No messages exchanged yet.</Text>
              ) : (
                data?.messages.map((msg) => {
                  const isSchool = msg.sender_type === 'STAFF';
                  return (
                    <View
                      key={msg.id}
                      style={[
                        styles.messageBubble,
                        isSchool ? styles.msgSchoolBubble : styles.msgParentBubble,
                      ]}
                    >
                      <Text style={styles.msgSender}>
                        {isSchool ? 'Admissions Team' : 'You (Parent)'} •{' '}
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.msgSubject}>{msg.subject}</Text>
                      <Text style={styles.msgBody}>{msg.message}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </View></TourTarget>
        )}
        <AppTourQuickAction portal="applicant" />
      </TourScrollView>

      {/* Upload Document Modal */}
      <Modal
        visible={uploadModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload {selectedDocTitle}</Text>
              <TouchableOpacity onPress={() => setUploadModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Please select a clear PDF document or photo from your device.
            </Text>

            {uploadingDoc ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0F766E" />
                <Text style={{ marginTop: 12, color: '#64748B' }}>
                  Uploading & encrypting document...
                </Text>
              </View>
            ) : (
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalActionBtn}
                  onPress={handlePickDocument}
                >
                  <Ionicons name="document-outline" size={28} color="#0F766E" />
                  <Text style={styles.modalActionBtnText}>Choose PDF / File</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalActionBtn}
                  onPress={handlePickImage}
                >
                  <Ionicons name="images-outline" size={28} color="#0F766E" />
                  <Text style={styles.modalActionBtnText}>Choose Photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View></TourTarget>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerAppBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#14B8A6',
    letterSpacing: 0.5,
  },
  headerStudentName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  headerMeta: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  signOutText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  stageStatusRow: {
    marginTop: 14,
    flexDirection: 'row',
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stageBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  nextActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: -10,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    gap: 12,
  },
  nextActionPending: {
    backgroundColor: '#CCFBF1',
    borderColor: '#99F6E4',
    borderWidth: 1,
  },
  nextActionConfirmed: {
    backgroundColor: '#D1FAE5',
    borderColor: '#6EE7B7',
    borderWidth: 1,
  },
  nextActionTextCol: {
    flex: 1,
  },
  nextActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F766E',
  },
  nextActionDesc: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
    lineHeight: 16,
  },
  nextActionBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  nextActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 4,
  },
  tabItemActive: {
    backgroundColor: '#F0FDFA',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  tabContent: {
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 10,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  trophyCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  trophyGradient: {
    padding: 24,
    alignItems: 'center',
  },
  trophyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
  },
  trophySubtitle: {
    fontSize: 13,
    color: '#D1FAE5',
    marginTop: 4,
  },
  admissionNoPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    marginVertical: 12,
  },
  admissionNoText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 1,
  },
  trophyNote: {
    fontSize: 12,
    color: '#ECFDF5',
    textAlign: 'center',
    lineHeight: 18,
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepCircleDone: {
    backgroundColor: '#059669',
  },
  stepCircleCurrent: {
    backgroundColor: '#0F766E',
  },
  progressPct: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 4,
  },
  stepCirclePending: {
    backgroundColor: '#E2E8F0',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  stepLabel: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  timelineRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0D9488',
    marginTop: 4,
  },
  timelineBody: {
    flex: 1,
  },
  timelineStage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelineRemarks: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  timelineDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  draftBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
  },
  formActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  saveDraftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0F766E',
    gap: 6,
  },
  saveDraftBtnText: {
    color: '#0F766E',
    fontWeight: '700',
    fontSize: 14,
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0F766E',
    gap: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  docItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  docItemRejected: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  docItemVerified: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  docItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  docIconPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docIconVerified: {
    backgroundColor: '#D1FAE5',
  },
  docIconRejected: {
    backgroundColor: '#FEE2E2',
  },
  docIconPending: {
    backgroundColor: '#CCFBF1',
  },
  docItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  docItemMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  rejectionBox: {
    backgroundColor: '#FEE2E2',
    padding: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  rejectionReasonText: {
    fontSize: 11,
    color: '#B91C1C',
    fontWeight: '600',
  },
  docItemActionCol: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 8,
  },
  docStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  docBadgeVerified: {
    backgroundColor: '#D1FAE5',
  },
  docBadgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  docBadgeUploaded: {
    backgroundColor: '#DBEAFE',
  },
  docBadgeMissing: {
    backgroundColor: '#E2E8F0',
  },
  docStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  uploadDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#CCFBF1',
    gap: 4,
  },
  replaceDocBtn: {
    backgroundColor: '#FEE2E2',
  },
  uploadDocBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
    lineHeight: 18,
  },
  emptyNote: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  interviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  interviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  interviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  interviewModePill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  interviewModeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  interviewDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  interviewDetailText: {
    fontSize: 13,
    color: '#475569',
  },
  feedbackBox: {
    marginTop: 10,
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
  },
  feedbackLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  feedbackText: {
    fontSize: 12,
    color: '#1E293B',
    marginTop: 2,
  },
  composeBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sendMsgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
    height: 40,
    borderRadius: 10,
    marginTop: 10,
  },
  sendMsgBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  msgSchoolBubble: {
    backgroundColor: '#F0FDFA',
    borderLeftWidth: 3,
    borderLeftColor: '#0F766E',
  },
  msgParentBubble: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#64748B',
  },
  msgSender: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  msgSubject: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  msgBody: {
    fontSize: 13,
    color: '#334155',
    marginTop: 4,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  modalActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F0FDFA',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    gap: 8,
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
});
