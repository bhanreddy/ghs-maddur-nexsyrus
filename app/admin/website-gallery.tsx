import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AdminHeader from '../../src/components/AdminHeader';
import { ResponsiveCard } from '../../src/components/ResponsiveCard';
import { useTheme } from '../../src/hooks/useTheme';
import type { SchoolTheme } from '../../src/theme/types';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { SCHOOL_CONFIG } from '../../src/constants/schoolConfig';
import {
  WebsiteGalleryItem,
  WebsiteGalleryService,
} from '../../src/services/websiteGalleryService';

const CATEGORY_SUGGESTIONS = ['Campus', 'Events', 'Achievements', 'Activities'];

type PickedPhoto = ImagePicker.ImagePickerAsset;

export default function WebsiteGalleryScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const columns = width >= 1180 ? 4 : width >= 760 ? 3 : width >= 520 ? 2 : 1;
  const cardWidth = columns === 1 ? '100%' : `${100 / columns - 1.5}%` as const;

  const [items, setItems] = useState<WebsiteGalleryItem[]>([]);
  const [selected, setSelected] = useState<PickedPhoto[]>([]);
  const [category, setCategory] = useState('Campus');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const websiteGalleryConfig = SCHOOL_CONFIG.websiteGallery;

  const loadGallery = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      setItems(await WebsiteGalleryService.list());
    } catch (error: any) {
      alertCompat('Could not load website gallery', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!websiteGalleryConfig.enabled) {
      alertCompat(
        websiteGalleryConfig.unavailableTitle,
        websiteGalleryConfig.unavailableMessage,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Contact Nexsyrus',
            onPress: () => {
              void Linking.openURL(websiteGalleryConfig.contactUrl).catch(() => {
                alertCompat('Could not open contact link', 'Please contact Nexsyrus directly to build your school website.');
              });
            },
          },
        ],
      );
      setLoading(false);
      return;
    }
    void loadGallery();
  }, [loadGallery, websiteGalleryConfig]);

  const choosePhotos = async () => {
    if (uploading) return;
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alertCompat('Photos permission needed', 'Allow photo library access to add website gallery photos.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.95,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets?.length) setSelected(result.assets);
  };

  const uploadSelected = async () => {
    if (!selected.length || uploading) return;
    if (!category.trim()) {
      alertCompat('Category needed', 'Add a short category such as Campus or Events.');
      return;
    }

    setUploading(true);
    const uploaded: WebsiteGalleryItem[] = [];
    try {
      for (let index = 0; index < selected.length; index += 1) {
        setUploadProgress(`Uploading ${index + 1} of ${selected.length}`);
        const asset = selected[index];
        uploaded.push(await WebsiteGalleryService.upload({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          category,
          caption,
          altText: caption || `${category} at school`,
        }));
      }
      setItems((current) => [...current, ...uploaded]);
      setSelected([]);
      setCaption('');
      alertCompat(
        uploaded.length === 1 ? 'Photo published' : 'Photos published',
        `${uploaded.length} ${uploaded.length === 1 ? 'photo is' : 'photos are'} now available to the school website.`,
      );
    } catch (error: any) {
      if (uploaded.length) setItems((current) => [...current, ...uploaded]);
      alertCompat(
        'Upload stopped',
        `${uploaded.length} of ${selected.length} photos were published. ${error?.message || 'Please try the remaining photos again.'}`,
      );
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const confirmDelete = (item: WebsiteGalleryItem) => {
    if (deletingId) return;
    alertCompat(
      'Remove this website photo?',
      'It will disappear from the public school gallery. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              await WebsiteGalleryService.remove(item.id);
              setItems((current) => current.filter((photo) => photo.id !== item.id));
            } catch (error: any) {
              alertCompat('Could not remove photo', error?.message || 'Please try again.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  if (!websiteGalleryConfig.enabled) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <AdminHeader title="Website Gallery" showBackButton />
        <View style={styles.websiteRequiredWrap}>
          <View style={styles.websiteRequiredCard}>
            <View style={styles.websiteRequiredIcon}>
              <Ionicons name="globe-outline" size={36} color={theme.colors.primary} />
            </View>
            <Text style={styles.websiteRequiredTitle}>{websiteGalleryConfig.unavailableTitle}</Text>
            <Text style={styles.websiteRequiredText}>{websiteGalleryConfig.unavailableMessage}</Text>
            <TouchableOpacity
              style={styles.contactButton}
              activeOpacity={0.8}
              onPress={() => {
                void Linking.openURL(websiteGalleryConfig.contactUrl).catch(() => {
                  alertCompat('Could not open contact link', 'Please contact Nexsyrus directly to build your school website.');
                });
              }}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
              <Text style={styles.contactButtonText}>Contact Nexsyrus</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TourTarget id="screen.admin-website-gallery.overview"><AdminHeader title="Website Gallery" showBackButton /></TourTarget>
      <TourTarget id="screen.admin-website-gallery.workspace" native><TourScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadGallery(true)}
            tintColor={theme.colors.primary}
          />
        )}
      >
        <ResponsiveCard maxWidth={1180}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="images-outline" size={26} color="#FFFFFF" />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Manage the public school gallery</Text>
              <Text style={styles.heroText}>
                Photos added here are published only to this school&apos;s website. Other schools remain completely separate.
              </Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{items.length} live</Text>
            </View>
          </View>

          <View style={styles.uploadCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Add photos</Text>
                <Text style={styles.sectionHint}>Choose up to 10 images at once · 15 MB maximum each</Text>
              </View>
              <TouchableOpacity
                style={styles.chooseButton}
                onPress={choosePhotos}
                disabled={uploading}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={19} color="#FFFFFF" />
                <Text style={styles.chooseButtonText}>Choose photos</Text>
              </TouchableOpacity>
            </View>

            {!!selected.length && (
              <>
                <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
                  {selected.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.previewWrap}>
                      <Image source={{ uri: photo.uri }} style={styles.previewImage} />
                      <TouchableOpacity
                        style={styles.previewRemove}
                        onPress={() => setSelected((current) => current.filter((_, i) => i !== index))}
                        disabled={uploading}
                      >
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </TourScrollView>

                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.chipRow}>
                  {CATEGORY_SUGGESTIONS.map((suggestion) => {
                    const active = category === suggestion;
                    return (
                      <TouchableOpacity
                        key={suggestion}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setCategory(suggestion)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{suggestion}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  maxLength={60}
                  placeholder="Or type a custom category"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  editable={!uploading}
                />

                <Text style={styles.fieldLabel}>Caption <Text style={styles.optional}>(optional)</Text></Text>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={180}
                  placeholder="Example: Annual Day celebrations 2026"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  editable={!uploading}
                />

                <View style={styles.publishRow}>
                  <Text style={styles.selectionCount}>{selected.length} selected</Text>
                  <TouchableOpacity
                    style={[styles.publishButton, uploading && styles.disabledButton]}
                    onPress={uploadSelected}
                    disabled={uploading}
                    activeOpacity={0.8}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="cloud-upload-outline" size={19} color="#FFFFFF" />
                    )}
                    <Text style={styles.publishButtonText}>{uploading ? uploadProgress : 'Publish photos'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={styles.galleryHeader}>
            <View>
              <Text style={styles.sectionTitle}>Published photos</Text>
              <Text style={styles.sectionHint}>Deleting a photo removes it only from this school&apos;s public website.</Text>
            </View>
            <TouchableOpacity style={styles.refreshButton} onPress={() => void loadGallery(true)}>
              <Ionicons name="refresh" size={17} color={theme.colors.primary} />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.stateText}>Loading gallery…</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.stateBox}>
              <View style={styles.emptyIcon}>
                <Ionicons name="image-outline" size={32} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No published photos yet</Text>
              <Text style={styles.stateText}>Choose photos above to create this school&apos;s gallery.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {items.map((item) => (
                <View key={item.id} style={[styles.photoCard, { width: cardWidth }]}>
                  <Image source={{ uri: item.image_url }} style={styles.photo} resizeMode="cover" />
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{item.category}</Text>
                  </View>
                  <View style={styles.photoFooter}>
                    <View style={styles.photoMeta}>
                      <Text style={styles.photoCaption} numberOfLines={1}>
                        {item.caption || item.alt_text}
                      </Text>
                      <Text style={styles.photoDate}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => confirmDelete(item)}
                      disabled={!!deletingId}
                      accessibilityLabel="Remove gallery photo"
                    >
                      {deletingId === item.id ? (
                        <ActivityIndicator size="small" color={theme.colors.danger} />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ResponsiveCard>
      </TourScrollView></TourTarget>
    </View>
  );
}

function createStyles(theme: SchoolTheme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    websiteRequiredWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    websiteRequiredCard: {
      width: '100%', maxWidth: 520, alignItems: 'center',
      backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
      borderRadius: 24, padding: 30, ...theme.shadows.md,
    },
    websiteRequiredIcon: {
      width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.colors.navPill, marginBottom: 18,
    },
    websiteRequiredTitle: { color: theme.colors.textStrong, fontSize: 22, fontWeight: '800', textAlign: 'center' },
    websiteRequiredText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
    contactButton: {
      minHeight: 46, paddingHorizontal: 20, borderRadius: 13, backgroundColor: '#16A34A',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22,
    },
    contactButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    scrollContent: { padding: 18, paddingBottom: 52 },
    heroCard: {
      backgroundColor: theme.colors.primaryDark,
      borderRadius: 20,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 18,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    heroCopy: { flex: 1 },
    heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
    heroText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginTop: 4 },
    livePill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
    liveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    uploadCard: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 20,
      padding: 18,
      marginBottom: 28,
      ...theme.shadows.sm,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sectionTitle: { color: theme.colors.textStrong, fontSize: 18, fontWeight: '800' },
    sectionHint: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
    chooseButton: {
      minHeight: 42, paddingHorizontal: 15, borderRadius: 12, backgroundColor: theme.colors.primary,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    },
    chooseButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    previewRow: { gap: 10, paddingVertical: 18 },
    previewWrap: { width: 104, height: 82, borderRadius: 12, overflow: 'visible' },
    previewImage: { width: 104, height: 82, borderRadius: 12, backgroundColor: theme.colors.borderLight },
    previewRemove: {
      position: 'absolute', right: -6, top: -6, width: 24, height: 24, borderRadius: 12,
      backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center',
    },
    fieldLabel: { color: theme.colors.textStrong, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 7 },
    optional: { color: theme.colors.textMuted, fontWeight: '500' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 9 },
    chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    chipActive: { backgroundColor: theme.colors.navPill, borderColor: theme.colors.primary },
    chipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: theme.colors.primary },
    input: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      paddingHorizontal: 13,
      minHeight: 44,
      color: theme.colors.textPrimary,
      fontSize: 14,
    },
    publishRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18 },
    selectionCount: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '700' },
    publishButton: {
      minHeight: 44, paddingHorizontal: 17, borderRadius: 12, backgroundColor: theme.colors.success,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    publishButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    disabledButton: { opacity: 0.65 },
    galleryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
    refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8 },
    refreshText: { color: theme.colors.primary, fontSize: 12, fontWeight: '800' },
    stateBox: { minHeight: 240, alignItems: 'center', justifyContent: 'center', padding: 28 },
    stateText: { color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 10 },
    emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: theme.colors.borderLight, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { color: theme.colors.textStrong, fontSize: 17, fontWeight: '800', marginTop: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' },
    photoCard: {
      minWidth: 230,
      borderRadius: 17,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    photo: { width: '100%', height: 185, backgroundColor: theme.colors.borderLight },
    categoryBadge: {
      position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(15,23,42,0.78)',
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
    },
    categoryBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
    photoFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    photoMeta: { flex: 1, minWidth: 0 },
    photoCaption: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '700' },
    photoDate: { color: theme.colors.textMuted, fontSize: 10, marginTop: 3 },
    deleteButton: {
      width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.colors.alertBgDanger,
    },
  });
}
