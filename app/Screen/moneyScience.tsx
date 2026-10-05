import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { MoneyScienceService } from '../../src/services/moneyScienceService';
import { MoneyScienceModule } from '../../src/types/models';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
const MoneyScienceScreen = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(), []);
  const router = useRouter();
  const [modules, setModules] = useState<MoneyScienceModule[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const data = await MoneyScienceService.getAllModules();
      setModules(data);
    } catch (err) {

    } finally {
      setLoading(false);
    }
  };
  const handlePress = (item: MoneyScienceModule) => {
    router.push({
      pathname: '/Screen/contentDetail',
      params: {
        title: item.title,
        content_body: item.content_body || item.description || 'No content.',
        image_url: item.thumbnail_url,
        headerColor: '#e65100'
      }
    });
  };
  return <ScreenLayout>
            <TourTarget id="screen.screen-money-science.overview"><StudentHeader showBackButton={true} title="Money Science" /></TourTarget>
            <TourTarget id="screen.screen-money-science.workspace" native><TourScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
                <View style={styles.titleContainer}>
                    <Text style={styles.pageTitle}>Money Science</Text>
                    <Text style={styles.subtitle}>
                        Financial literacy for a brighter future.
                    </Text>
                </View>
                {/* ===== TOPIC LIST ===== */}
                <Text style={styles.sectionTitle}>Learning Modules</Text>
                {loading ? <LogoLoader size={60} color="#e65100" /> : modules.map((topic) => {
        return <TouchableOpacity key={topic.id} activeOpacity={0.9} onPress={() => handlePress(topic)}>
                            <LinearGradient colors={['#fff3e0', '#ffe0b2']} start={{
            x: 0,
            y: 0
          }} end={{
            x: 1,
            y: 1
          }} style={styles.topicCard}>
                                <View style={styles.left}>
                                    <View style={styles.iconCircle}>
                                        <Text style={styles.icon}>💰</Text>
                                    </View>
                                    <View style={{
                flex: 1
              }}>
                                        <Text style={styles.topicText}>{topic.title}</Text>
                                        {topic.age_group && <Text style={styles.ageText}>Age: {topic.age_group}</Text>}
                                    </View>
                                </View>
                                <View style={styles.arrowContainer}>
                                    <Text style={styles.arrow}>›</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>;
      })}
                {!loading && modules.length === 0 && <Text style={styles.empty}>No modules available yet.</Text>}
                {/* ===== GOAL CARD ===== */}
                <LinearGradient colors={['#e3f2fd', '#bbdefb']} style={styles.goalCard}>
                    <View>
                        <Text style={styles.goalTitle}>Piggy Bank Challenge</Text>
                        <Text style={styles.goalText}>Start saving small today!</Text>
                    </View>
                    <Text style={styles.goalIcon}>🐷</Text>
                </LinearGradient>
            </TourScrollView></TourTarget>
        </ScreenLayout>;
};
export default MoneyScienceScreen;
const getStyles = () => StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 30
  },
  titleContainer: {
    marginBottom: 20
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e65100',
    // Dark Orange
    marginBottom: 4
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f57c00'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ef6c00',
    marginBottom: 16,
    marginLeft: 4
  },
  topicCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#e65100',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)'
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  icon: {
    fontSize: 22
  },
  topicText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e65100'
  },
  ageText: {
    fontSize: 12,
    color: '#ef6c00',
    marginTop: 2
  },
  arrowContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  arrow: {
    fontSize: 18,
    fontWeight: '800',
    color: '#e65100',
    marginTop: -2
  },
  goalCard: {
    marginTop: 20,
    borderRadius: 18,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    borderWidth: 1,
    borderColor: '#90caf9'
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0d47a1',
    marginBottom: 4
  },
  goalText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e88e5'
  },
  goalIcon: {
    fontSize: 40
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    marginBottom: 20
  }
});