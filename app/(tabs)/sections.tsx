import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter, type Href } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getApiErrorMessage } from '@/services/api';
import { yearbookService, type SectionCard } from '@/services/yearbook';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { asText } from '@/utils/text';

export default function SectionsScreen() {
  const router = useRouter();
  const {
    promptVisible,
    lockedFeature,
    checking,
    requireSubscription,
    closePrompt,
    refreshAfterUpgrade,
  } = useSubscriptionGate();
  const [sections, setSections] = useState<SectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await yearbookService.getSections();
      setSections(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load sections.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  const batchLabel = asText(sections[0]?.batch_label, 'SECTIONS');

  const openStudent = async (id: string | number) => {
    const sid = asText(id);
    if (!sid || checking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { allowed } = await requireSubscription('profile', { allowOwnerId: sid });
    if (!allowed) return;

    router.push(`/student/${sid}` as unknown as Href);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <UpgradePrompt
        visible={promptVisible}
        feature={lockedFeature}
        onClose={closePrompt}
        onUpgraded={() => {
          void refreshAfterUpgrade();
        }}
      />
      <ScreenHeader title="Sections" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.batchInfo}>
          <Text style={styles.batchTitle}>{batchLabel}</Text>
          <Text style={styles.batchSubtitle}>View students organized by their sections</Text>
        </View>

        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={styles.stateText}>Loading sections…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadSections()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateText}>No sections available yet.</Text>
          </View>
        ) : (
          sections.map((section, sIndex) => (
            <View key={`section-${asText(section.id, 'id')}-${sIndex}`} style={styles.sectionCard}>
              {section.mainImage ? (
                <Image source={section.mainImage} style={styles.groupPhoto} contentFit="cover" />
              ) : (
                <View style={[styles.groupPhoto, styles.groupPhotoPlaceholder]}>
                  <FontAwesome name="users" size={32} color="#8E8E93" />
                </View>
              )}

              <View style={styles.cardBody}>
                <Text style={styles.sectionName}>{asText(section.title, 'Section')}</Text>

                <View style={styles.adviserSection}>
                  <Text style={styles.adviserLabel}>Class Adviser</Text>
                  <View style={styles.adviserInfo}>
                    <View style={styles.adviserAvatarPlaceholder}>
                      <FontAwesome name="user" size={14} color="#35408E" />
                    </View>
                    <Text style={styles.adviserName}>{asText(section.adviser, 'Class Adviser')}</Text>
                  </View>
                </View>

                <View style={styles.studentGrid}>
                  {(section.students || []).length === 0 ? (
                    <Text style={styles.noStudentsText}>No students yet</Text>
                  ) : (
                    (section.students || []).map((student, index) => (
                      <TouchableOpacity
                        key={`thumb-${asText(student.id, 'id')}-${index}`}
                        onPress={() => openStudent(student.id)}
                      >
                        {student.image ? (
                          <Image source={student.image} style={styles.studentThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.studentThumb, styles.studentThumbPlaceholder]}>
                            <FontAwesome name="user" size={16} color="#8E8E93" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/directory',
                      params: { section: asText(section.title) },
                    });
                  }}
                >
                  <Text style={styles.viewButtonText}>View All Students</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  batchInfo: {
    marginBottom: 24,
  },
  batchTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#35408E',
  },
  batchSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  stateContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#35408E',
  },
  retryText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    marginBottom: 32,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  groupPhoto: {
    width: '100%',
    height: 140,
  },
  groupPhotoPlaceholder: {
    backgroundColor: '#E8EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    padding: 16,
  },
  sectionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  adviserSection: {
    marginBottom: 16,
  },
  adviserLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  adviserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adviserAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: '#E8EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adviserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#35408E',
  },
  studentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
    justifyContent: 'center',
  },
  noStudentsText: {
    fontSize: 14,
    color: '#8E8E93',
    paddingVertical: 12,
  },
  studentThumb: {
    width: 45,
    height: 45,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  studentThumbPlaceholder: {
    backgroundColor: '#F0F2F8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35408E',
  },
  viewButtonText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
