import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  SummaryStats,
  SearchField,
  FilterPills,
  InitialsAvatar,
  premiumStyles,
  type FilterPill,
} from '@/components/premium';
import { asText } from '@/utils/text';
import { getInitials } from '@/utils/initials';

export default function SectionsScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<SectionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeBatch, setActiveBatch] = useState('All');

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

  const batchOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: FilterPill[] = [{ key: 'all', label: 'All', value: 'All' }];
    sections.forEach((section, index) => {
      const label = asText(section.batch_label, 'Sections');
      if (!label || seen.has(label)) return;
      seen.add(label);
      options.push({
        key: `batch-${label}-${index}`,
        label,
        value: label,
      });
    });
    return options;
  }, [sections]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections.filter((section) => {
      const batch = asText(section.batch_label, 'Sections');
      if (activeBatch !== 'All' && batch !== activeBatch) return false;
      if (!q) return true;
      return (
        asText(section.title).toLowerCase().includes(q) ||
        asText(section.adviser).toLowerCase().includes(q) ||
        batch.toLowerCase().includes(q)
      );
    });
  }, [sections, search, activeBatch]);

  const stats = useMemo(() => {
    const studentCount = sections.reduce(
      (sum, s) => sum + (s.students_count ?? (s.students || []).length),
      0,
    );
    const batches = new Set(
      sections.map((s) => asText(s.batch_label)).filter(Boolean),
    );
    return [
      { key: 'sections', label: 'Sections', value: sections.length },
      { key: 'students', label: 'Students', value: studentCount },
      { key: 'batches', label: 'Batches', value: batches.size || 1 },
    ];
  }, [sections]);

  const openStudent = (id: string | number) => {
    const sid = asText(id);
    if (!sid) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/student/${sid}` as unknown as Href);
  };

  return (
    <SafeAreaView style={premiumStyles.screen}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Sections"
        subtitle="Classes organized by section"
        icon="th-large"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={premiumStyles.scrollContent}>
        <SummaryStats items={stats} />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search sections or advisers…"
        />

        <FilterPills
          items={batchOptions}
          activeValue={activeBatch}
          onChange={setActiveBatch}
        />

        {loading ? (
          <View style={premiumStyles.centerState}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={premiumStyles.mutedText}>Loading sections…</Text>
          </View>
        ) : error ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.errorText}>{error}</Text>
            <TouchableOpacity style={premiumStyles.primaryButton} onPress={() => void loadSections()}>
              <Text style={premiumStyles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredSections.length === 0 ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.mutedText}>No sections available yet.</Text>
          </View>
        ) : (
          filteredSections.map((section, sIndex) => (
            <View
              key={`section-${asText(section.id, 'id')}-${sIndex}`}
              style={styles.sectionCard}
            >
              {section.mainImage ? (
                <Image source={section.mainImage} style={styles.groupPhoto} contentFit="cover" />
              ) : (
                <View style={[styles.groupPhoto, styles.groupPhotoPlaceholder]}>
                  <FontAwesome name="users" size={28} color="#FFFFFF" />
                  <Text style={styles.groupPhotoLabel}>
                    {asText(section.batch_label, 'SECTION')}
                  </Text>
                </View>
              )}

              <View style={styles.cardBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.sectionName}>{asText(section.title, 'Section')}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {section.students_count ?? (section.students || []).length} students
                    </Text>
                  </View>
                </View>

                <View style={styles.adviserSection}>
                  <Text style={styles.adviserLabel}>Class Adviser</Text>
                  <View style={styles.adviserInfo}>
                    <InitialsAvatar
                      name={section.adviser}
                      size={28}
                      backgroundColor="#E8EFFF"
                    />
                    <Text style={styles.adviserName}>
                      {asText(section.adviser, 'Class Adviser')}
                    </Text>
                  </View>
                </View>

                <View style={styles.studentGrid}>
                  {(section.students || []).length === 0 ? (
                    <Text style={styles.noStudentsText}>No students yet</Text>
                  ) : (
                    (section.students || []).slice(0, 12).map((student, index) => (
                      <TouchableOpacity
                        key={`thumb-${asText(student.id, 'id')}-${index}`}
                        onPress={() => openStudent(student.id)}
                        style={styles.thumbWrap}
                      >
                        {student.image ? (
                          <Image
                            source={student.image}
                            style={styles.studentThumb}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.studentThumb, styles.studentThumbPlaceholder]}>
                            <Text style={styles.thumbInitials}>{getInitials(student.name)}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    marginBottom: 14,
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  groupPhoto: {
    width: '100%',
    height: 128,
  },
  groupPhotoPlaceholder: {
    backgroundColor: '#1C2456',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  groupPhotoLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardBody: {
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  sectionName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  countBadge: {
    backgroundColor: '#F0F2F8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5C6B8A',
  },
  adviserSection: {
    marginBottom: 14,
  },
  adviserLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  adviserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adviserName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#35408E',
  },
  studentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  noStudentsText: {
    fontSize: 13,
    color: '#8E8E93',
    paddingVertical: 8,
  },
  thumbWrap: {},
  studentThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  studentThumbPlaceholder: {
    backgroundColor: '#E8EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbInitials: {
    fontSize: 11,
    fontWeight: '800',
    color: '#35408E',
  },
  viewButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35408E',
  },
  viewButtonText: {
    color: '#35408E',
    fontWeight: '700',
    fontSize: 13,
  },
});
