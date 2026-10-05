import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { api } from '../../src/services/apiClient';

type ScienceProject = {
  id: string;
  title: string;
  description?: string | null;
  difficulty_level?: string | null;
  materials_required?: string[] | null;
  safety_instructions?: string | null;
  content_url?: string | null;
};

const ScienceProjectsScreen = () => {
  const styles = React.useMemo(() => getStyles(), []);
  const router = useRouter();
  const [projects, setProjects] = React.useState<ScienceProject[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const loadProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.get<ScienceProject[]>('/content/science-projects');
        if (mounted) setProjects(data || []);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load science projects');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProjects();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePress = (item: ScienceProject) => {
    const searchUrl = item.content_url || `https://www.google.com/search?q=${encodeURIComponent(`${item.title} science project`)}`;
    router.push({
      pathname: '/Screen/webView',
      params: {
        url: searchUrl,
        title: item.title
      }
    });
  };
  return <ScreenLayout>
            {/* ===== HEADER ===== */}
            <TourTarget id="screen.screen-science-projects.overview"><StudentHeader showBackButton={true} title="Science Projects" /></TourTarget>

            {/* ===== CONTENT ===== */}
            <TourTarget id="screen.screen-science-projects.workspace" native><TourScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
                {/* ===== TITLE ===== */}
                <View style={styles.titleContainer}>
                    <Text style={styles.pageTitle}>Science Projects</Text>
                    <Text style={styles.subtitle}>
                        Learn by doing • Build • Experiment
                    </Text>
                </View>

                {/* ===== PROJECT LIST ===== */}
                <Text style={styles.sectionTitle}>
                    Project List & Certification
                </Text>

                {loading ? <View style={styles.stateContainer}>
                    <ActivityIndicator color="#2e7d32" />
                    <Text style={styles.stateText}>Loading science projects...</Text>
                </View> : error ? <View style={styles.stateContainer}>
                    <Text style={styles.stateText}>{error}</Text>
                </View> : projects.length === 0 ? <View style={styles.stateContainer}>
                    <Text style={styles.stateText}>No science projects uploaded yet.</Text>
                </View> : projects.map((project) => {
 return <TouchableOpacity key={project.id} activeOpacity={0.9} onPress={() => handlePress(project)}>
                        <LinearGradient colors={['#e8f5e9', '#c8e6c9']} // Green-ish for science
          start={{
            x: 0,
            y: 0
          }} end={{
            x: 1,
            y: 1
          }} style={styles.projectCard}>
                            <View style={styles.left}>
                                <View style={styles.iconCircle}>
                                    <Text style={styles.icon}>🧪</Text>
                                </View>
                                <View style={styles.projectInfo}>
                                    <Text style={styles.projectText}>{project.title}</Text>
                                    {!!project.description && <Text style={styles.projectDescription} numberOfLines={2}>{project.description}</Text>}
                                    {!!project.difficulty_level && <Text style={styles.difficulty}>{project.difficulty_level.toUpperCase()}</Text>}
                                </View>
                            </View>

                            <View style={styles.arrowContainer}>
                                <Text style={styles.arrow}>›</Text>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>;
      })}

                {/* ===== CERTIFICATE INFO ===== */}
                <LinearGradient colors={['#fff8e1', '#ffecb3']} style={styles.certificateCard}>
                    <Text style={styles.certificateIcon}>🏆</Text>
                    <Text style={styles.certificateText}>
                        <Text style={{
            fontWeight: 'bold'
          }}>Get Certified!</Text>{'\n'}
                        Complete a project and submit your report to receive a certificate.
                    </Text>
                </LinearGradient>

            </TourScrollView></TourTarget>
        </ScreenLayout>;
};
export default ScienceProjectsScreen;

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
    color: '#1b5e20',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#558b2f'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#33691e',
    marginBottom: 16,
    marginLeft: 4
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30
  },
  stateText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#558b2f',
    textAlign: 'center'
  },
  projectCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#1b5e20',
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
    flex: 1
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
  projectText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1b5e20'
  },
  projectInfo: {
    flex: 1
  },
  projectDescription: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#33691e'
  },
  difficulty: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '800',
    color: '#2e7d32',
    letterSpacing: 0.5
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
    color: '#1b5e20',
    marginTop: -2
  },
  /* Certificate */
  certificateCard: {
    marginTop: 20,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#ff6f00',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#ffe082'
  },
  certificateIcon: {
    fontSize: 32,
    marginRight: 16
  },
  certificateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6d4c41',
    flex: 1,
    lineHeight: 20
  }
});