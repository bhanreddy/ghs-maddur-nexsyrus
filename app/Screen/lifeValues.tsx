import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { LifeValuesService } from '../../src/services/lifeValuesService';
import { LifeValuesModule } from '../../src/types/models';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
const LifeValuesScreen = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(), []);
  const router = useRouter();
  const [modules, setModules] = useState<LifeValuesModule[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const data = await LifeValuesService.getModules();
      setModules(data);
    } catch (err) {

    } finally {
      setLoading(false);
    }
  };
  const handlePress = (item: LifeValuesModule) => {
    // Navigate to native content screen
    router.push({
      pathname: '/Screen/contentDetail',
      params: {
        title: item.title,
        content_body: item.content_body || item.description || 'No content.',
        image_url: item.banner_image_url,
        headerColor: '#006064'
      }
    });
  };
  return <ScreenLayout>
    <TourTarget id="screen.screen-life-values.overview"><StudentHeader showBackButton={true} title="Life Values" /></TourTarget>
    <TourTarget id="screen.screen-life-values.workspace" native><TourScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
      <View style={styles.titleContainer}>
        <Text style={styles.pageTitle}>Life Values</Text>
        <Text style={styles.subtitle}>Timeless wisdom for modern life.</Text>
      </View>
      <Text style={styles.sectionTitle}>Modules</Text>
      {loading ? <LogoLoader size={60} color="#006064" /> : modules.map((subject) => {
        return <TouchableOpacity key={subject.id} activeOpacity={0.9} onPress={() => handlePress(subject)}>
          <LinearGradient colors={['#e0f7fa', '#b2ebf2']} start={{
            x: 0,
            y: 0
          }} end={{
            x: 1,
            y: 1
          }} style={styles.subjectCard}>
            <View style={styles.left}>
              <View style={styles.iconCircle}>
                <Text style={styles.icon}>🕉️</Text>
              </View>
              <View style={{
                flex: 1
              }}>
                <Text style={styles.subjectText}>{subject.title}</Text>
                <Text style={styles.descText} numberOfLines={1}>
                  {subject.description}
                </Text>
              </View>
            </View>
            <View style={styles.arrowContainer}>
              <Text style={styles.arrow}>›</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>;
      })}
      {!loading && modules.length === 0 && <Text style={styles.empty}>No modules available yet.</Text>}
    </TourScrollView></TourTarget>
  </ScreenLayout>;
};
export default LifeValuesScreen;

/* ============================ STYLES ============================ */

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
    color: '#006064',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#546e7a'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#455a64',
    marginBottom: 16,
    marginLeft: 4
  },
  subjectCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#004d40',
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
  subjectText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#006064'
  },
  descText: {
    fontSize: 12,
    color: '#00838f',
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
    color: '#006064',
    marginTop: -2
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 20
  }
});