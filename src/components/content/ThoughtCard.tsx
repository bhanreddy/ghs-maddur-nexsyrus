import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { readAloudService } from '@/src/services/readAloudService';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { clayTokens } from '@/src/styles/clayTokens';
import { ContentItem, contentService } from '@/src/services/contentService';

interface ThoughtCardProps {
  thought: ContentItem;
  onLikeToggled?: (liked: boolean, count: number) => void;
  style?: any;
}

export default function ThoughtCard({ thought, onLikeToggled, style }: ThoughtCardProps) {
  const { isDark } = useTheme();
  const [isLiked, setIsLiked] = useState(Boolean(thought.is_liked));
  const [likeCount, setLikeCount] = useState(thought.like_count || 0);
  const audioId = `thought:${thought.id}`;
  const audio = useSyncExternalStore(readAloudService.subscribe, readAloudService.getSnapshot, readAloudService.getSnapshot);
  const isPlayingAudio = audio.activeId === audioId && audio.status !== 'idle';
  useEffect(() => () => { void readAloudService.stop(audioId); }, [audioId]);

  const quote = thought.quote || thought.title || '';
  const author = thought.author || 'Anonymous';
  const authorDesc = thought.author_description;
  const category = thought.category || 'Inspiration';

  const handleLike = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newLiked = !isLiked;
    const newCount = newLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
    setIsLiked(newLiked);
    setLikeCount(newCount);

    if (onLikeToggled) onLikeToggled(newLiked, newCount);

    try {
      await contentService.toggleLike(thought.id);
    } catch {
      try {
        await contentService.recordAnalytics(thought.id, 'LIKE');
      } catch {
        // ignore
      }
    }
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        title: "Today's Thought • SchoolIMS",
        message: `“${quote}”\n— ${author}${authorDesc ? ` (${authorDesc})` : ''}\n\nShared via SchoolIMS Daily`,
      });
      await contentService.recordAnalytics(thought.id, 'SHARE');
    } catch {
      // user cancelled or failed
    }
  };

  const handleToggleAudio = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void readAloudService.toggle(audioId, [quote, author]);
  };

  const cardBg = isDark ? clayTokens.colors.card.dark : clayTokens.colors.daily.thoughtBg;
  const quoteColor = isDark ? '#F1F5F9' : clayTokens.colors.text.primary;
  const authorColor = isDark ? '#94A3B8' : clayTokens.colors.text.muted;
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(139,104,64,0.16)';
  const catBg = isDark ? 'rgba(139,104,64,0.22)' : clayTokens.colors.daily.thoughtSoft;

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor: borderCol }, style]}>
      {/* Decorative gradient aura top accent */}
      <LinearGradient
        colors={isDark ? ['#8B6840', '#B05632'] : ['#C4A484', '#8B6840']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentBar}
      />

      <View style={styles.cardContent}>
        {/* Header: Category Badge & Audio speaker */}
        <View style={styles.headerRow}>
          <View style={[styles.catBadge, { backgroundColor: catBg }]}>
            <Ionicons name="sunny-outline" size={12} color={clayTokens.colors.daily.thoughtAccent} style={{ marginRight: 4 }} />
            <Text style={styles.catText}>{category.toUpperCase()}</Text>
          </View>

          <View style={styles.actionIconsRight}>
            <TouchableOpacity
              onPress={handleToggleAudio}
              style={[styles.miniBtn, isPlayingAudio && styles.miniBtnActive]}
              accessibilityLabel="Listen to thought"
            >
              <Ionicons
                name={isPlayingAudio ? 'volume-high' : 'volume-medium-outline'}
                size={18}
                color={isPlayingAudio ? '#6366F1' : authorColor}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShare}
              style={styles.miniBtn}
              accessibilityLabel="Share thought"
            >
              <Ionicons name="share-outline" size={18} color={authorColor} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Large Decorative Quote Symbol */}
        <Text style={[styles.largeQuoteSymbol, { color: isDark ? '#1E293B' : '#E2E8F0' }]}>“</Text>

        {/* The Quote Body */}
        <Text style={[styles.quoteText, { color: quoteColor }]}>
          {quote}
        </Text>

        {/* Author Attribution */}
        <View style={styles.footerRow}>
          <View style={styles.authorCol}>
            <View style={styles.authorLine}>
              <View style={[styles.dash, { backgroundColor: clayTokens.colors.daily.thoughtAccent }]} />
              <Text style={[styles.authorName, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
                {author}
              </Text>
            </View>
            {authorDesc ? (
              <Text style={[styles.authorDesc, { color: authorColor }]}>{authorDesc}</Text>
            ) : null}
          </View>

          {/* Like Interaction */}
          <TouchableOpacity
            onPress={handleLike}
            style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={18}
              color={isLiked ? '#EF4444' : authorColor}
            />
            {likeCount > 0 ? (
              <Text style={[styles.likeCountText, { color: isLiked ? '#EF4444' : authorColor }]}>
                {likeCount}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: clayTokens.radii.card,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.10)',
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  cardContent: {
    padding: 20,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  catText: {
    fontSize: 11,
    fontWeight: '700',
    color: clayTokens.colors.daily.thoughtAccent,
    letterSpacing: 0.6,
  },
  actionIconsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  miniBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  largeQuoteSymbol: {
    position: 'absolute',
    top: 24,
    right: 18,
    fontSize: 84,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight: 84,
    opacity: 0.6,
    zIndex: -1,
  },
  quoteText: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.15)',
    paddingTop: 14,
  },
  authorCol: {
    flex: 1,
    marginRight: 12,
  },
  authorLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dash: {
    width: 14,
    height: 2,
    borderRadius: 1,
    marginRight: 8,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  authorDesc: {
    fontSize: 12,
    marginTop: 2,
    paddingLeft: 22,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  likeBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  likeCountText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export { ThoughtCard };
