import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { StudentService } from '../../src/services/studentService';
import { StaffService } from '../../src/services/staffService';
import { APIError } from '../../src/services/apiClient';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import Avatar from '../../src/components/Avatar';
import HardDeleteStudentModal from '../../src/components/accounts/HardDeleteStudentModal';
import {
  personListDisplayName,
  staffRoleDepartmentLine,
  studentEnrollmentSubtitle,
} from '../../src/utils/displayHelpers';

/** Higher page size than the API default so the un-searched browse list is usable. */
const LIST_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 400;

function resolvePhotoUrl(row: Record<string, unknown>): string | null {
  if (typeof row.photo_url === 'string' && row.photo_url.trim()) return row.photo_url;
  const person = row.person;
  if (person && typeof person === 'object' && !Array.isArray(person)) {
    const url = (person as Record<string, unknown>).photo_url;
    if (typeof url === 'string' && url.trim()) return url;
  }
  return null;
}

export default function ManageUsersScreen() {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { shellActive } = useAccountsWebChrome();
  const router = useRouter();
  const {
    t
  } = useTranslation();
  const {
    user
  } = useAuth();
  const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Student hard-delete: drives the 3-step confirmation modal.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; subtitle: string } | null>(null);

  // Guards against out-of-order responses: only the latest request may commit.
  const requestSeq = useRef(0);

  /**
   * Server-side fetch. The search term is sent to the backend (`?search=`),
   * which applies a case-insensitive DB filter across the FULL dataset.
   * There is no client-side `.filter()` — results always come from the API.
   */
  const loadUsers = useCallback(
    async (tab: 'student' | 'staff', search: string, { isSearch }: { isSearch?: boolean } = {}) => {
      if (!user?.userId) return;
      const seq = ++requestSeq.current;
      if (isSearch) setSearching(true); else setLoading(true);
      try {
        const trimmed = search.trim();
        let list: any[] = [];
        if (tab === 'student') {
          const response = await StudentService.getAll({
            search: trimmed || undefined,
            limit: LIST_PAGE_SIZE,
            page: 1,
          });
          list = Array.isArray(response) ? response : response?.data ?? [];
        } else {
          list = await StaffService.getAll({
            search: trimmed || undefined,
            limit: LIST_PAGE_SIZE,
            page: 1,
          });
        }
        // Ignore stale responses from a superseded request.
        if (seq !== requestSeq.current) return;
        setUsers(list);
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setUsers([]);
        alertCompat('Error', 'Failed to load users');
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setSearching(false);
        }
      }
    },
    [user?.userId]
  );

  // Initial load + full reload whenever the tab or signed-in user changes.
  // Switching tabs clears the search so we don't carry a stale term across tabs.
  useEffect(() => {
    setSearchQuery('');
    loadUsers(activeTab, '');
  }, [activeTab, user?.userId, loadUsers]);

  // Debounced server-side search: re-fetch from the API as the term settles.
  // Skips the very first run so we don't double-fetch on mount / tab switch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadUsers(activeTab, searchQuery, { isSearch: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, loadUsers]);

  const handleEdit = (user: any) => {
    if (activeTab === 'student') {
      router.push({
        pathname: '/accounts/addStudent',
        params: {
          id: user.id
        }
      });
    } else {
      router.push({
        pathname: '/accounts/addStaff',
        params: {
          id: user.id
        }
      });
    }
  };
  const handleDelete = (targetUser: any) => {
    const nm = personListDisplayName(targetUser as Record<string, unknown>);

    // Students get the strong, 3-step PERMANENT delete flow (wipes all their data).
    if (activeTab === 'student') {
      setDeleteTarget({
        id: targetUser.id,
        name: nm,
        subtitle: studentEnrollmentSubtitle(targetUser.current_enrollment) || '',
      });
      return;
    }

    // Staff keep the existing single-confirm soft delete.
    alertCompat("Confirm Delete", `Are you sure you want to delete ${nm}?`, [{
      text: "Cancel",
      style: "cancel"
    }, {
      text: "Delete",
      style: "destructive",
      onPress: async () => {
        try {
          await StaffService.delete(targetUser.id);
          loadUsers(activeTab, searchQuery);
          alertCompat("Success", "User deleted.");
        } catch (e) {
          const message = e instanceof APIError ? e.message : 'Failed to delete user';
          alertCompat("Error", message);
        }
      }
    }]);
  };
  const renderItem = ({
    item

  }: { item: any; }) => {
    const row = item as Record<string, unknown>;
    const displayName = personListDisplayName(row);
    const photoUrl = resolvePhotoUrl(row);
    return <View style={styles.userCard}>
      <Avatar
        photoUrl={photoUrl}
        name={displayName}
        size={44}
        ringColor={theme.colors.border}
        ringWidth={1}
        style={styles.avatar}
      />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{displayName}</Text>
        <Text style={styles.userSub}>
          {activeTab === 'student'
            ? studentEnrollmentSubtitle(row.current_enrollment)
            : staffRoleDepartmentLine(row)}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionBtn}>
          <Ionicons name="create-outline" size={20} color="#3B82F6" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>;
  };
  return <View style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#fff" />
    {!shellActive && <AdminHeader title="Manage Users" />}
    {/* TABS */}
    <View style={styles.tabs}>
      <TouchableOpacity style={[styles.tab, activeTab === 'student' && styles.activeTab]} onPress={() => setActiveTab('student')}>
        <Text style={[styles.tabText, activeTab === 'student' && styles.activeTabText]}>Students</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, activeTab === 'staff' && styles.activeTab]} onPress={() => setActiveTab('staff')}>
        <Text style={[styles.tabText, activeTab === 'staff' && styles.activeTabText]}>Staff</Text>
      </TouchableOpacity>
    </View>
    {/* SEARCH */}
    <View style={[styles.searchContainer, ds.searchBarWrapper]}>
      <Ionicons name="search" size={20} color="#9CA3AF" />
      <AppTextInput style={[ds.inputInChrome, styles.searchInput]} placeholder={`Search ${activeTab === 'student' ? 'Students' : 'Staff'}...`} value={searchQuery} onChangeText={setSearchQuery} />
      {searching ? <ActivityIndicator size="small" color="#3B82F6" /> : null}
    </View>
    {/* LIST */}
    {loading ? <LogoLoader size={60} color="#3B82F6" style={{
      marginTop: 40
    }} /> : <FlatList data={users} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.emptyText}>{searchQuery.trim() ? 'No matches found.' : 'No users found.'}</Text>} />}
    {/* FAB to Add New */}
    <TouchableOpacity style={styles.fab} onPress={() => {
      if (activeTab === 'student') router.push('/accounts/addStudent'); else router.push('/accounts/addStaff');
    }}>
      <Ionicons name="add" size={28} color="#fff" />
    </TouchableOpacity>
    <HardDeleteStudentModal
      visible={!!deleteTarget}
      studentId={deleteTarget?.id ?? null}
      studentName={deleteTarget?.name ?? ''}
      studentSubtitle={deleteTarget?.subtitle}
      onClose={() => setDeleteTarget(null)}
      onDeleted={() => {
        const nm = deleteTarget?.name;
        setDeleteTarget(null);
        loadUsers(activeTab, searchQuery);
        alertCompat('Deleted', `${nm ?? 'Student'} and all associated data were permanently deleted.`);
      }}
    />
  </View>;
}
const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    padding: 5,
    margin: 15,
    borderRadius: 12,
    marginBottom: 10
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  activeTab: {
    backgroundColor: '#EFF6FF'
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontWeight: '600'
  },
  activeTabText: {
    color: '#3B82F6',
    fontWeight: '700'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    marginHorizontal: 15,
    paddingHorizontal: 15,
    borderRadius: 12,
    height: 50,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16
  },
  list: {
    padding: 15,
    paddingBottom: 80
  },
  userCard: {
    backgroundColor: theme.colors.background,
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: theme.colors.text,
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  avatar: {
    marginRight: 12,
  },
  userInfo: {
    flex: 1
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937'
  },
  userSub: {
    fontSize: 13,
    color: theme.colors.textSecondary
  },
  actions: {
    flexDirection: 'row',
    gap: 15
  },
  actionBtn: {
    padding: 5
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: theme.colors.textTertiary
  },
  fab: {
    position: 'absolute',
    bottom: 25,
    right: 25,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#3B82F6",
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6
  }
});
