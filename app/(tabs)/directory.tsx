import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import yearbookService, { type DirectoryStudent } from '@/services/yearbook';
import { getApiErrorMessage } from '@/services/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { asText, firstText } from '@/utils/text';

type FilterOption = {
  key: string;
  value: string;
  label: string;
};

function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return asText(value[0]);
  return asText(value);
}

function normalizeFilters(rawList: unknown[]): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [{ key: 'filter-all-0', value: 'All', label: 'All' }];
  seen.add('all');

  rawList.forEach((item, index) => {
    const value = firstText(
      typeof item === 'object' && item != null
        ? (item as Record<string, unknown>).value ??
            (item as Record<string, unknown>).label ??
            (item as Record<string, unknown>).name ??
            (item as Record<string, unknown>).course
        : item,
      asText(item),
    );
    if (!value) return;

    const dedupe = value.toLowerCase();
    if (seen.has(dedupe)) return;
    seen.add(dedupe);

    options.push({
      key: `filter-${value}-${index}`,
      value,
      label: value,
    });
  });

  return options;
}

function normalizeStudents(list: unknown): (DirectoryStudent & { listKey: string })[] {
  if (!Array.isArray(list)) return [];

  const result: (DirectoryStudent & { listKey: string })[] = [];

  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const s = row as DirectoryStudent;
    const originalId = s.id ?? `anon-${index}`;

    result.push({
      id: originalId,
      listKey: `student-${String(originalId)}-${index}`,
      name: asText(s.name, 'Student'),
      degree: asText(s.degree, 'NU Lipa'),
      year: asText(s.year, 'Student'),
      section: asText(s.section, '—'),
      image: typeof s.image === 'string' && s.image ? s.image : null,
      bio: asText(s.bio),
      student_id: asText(s.student_id) || undefined,
      course: asText(s.course) || undefined,
      email: asText(s.email) || undefined,
    });
  });

  return result;
}

export default function DirectoryScreen() {
  const router = useRouter();
  const {
    promptVisible,
    lockedFeature,
    checking,
    requireSubscription,
    closePrompt,
    refreshAfterUpgrade,
  } = useSubscriptionGate();
  const params = useLocalSearchParams<{
    filter?: string | string[];
    section?: string | string[];
    course?: string | string[];
  }>();

  const sectionParam = paramToString(params.section);
  const courseParam = paramToString(params.course) || paramToString(params.filter);

  const [students, setStudents] = useState<(DirectoryStudent & { listKey: string })[]>([]);
  const [filters, setFilters] = useState<FilterOption[]>(() => normalizeFilters([]));
  const [activeFilter, setActiveFilter] = useState('All');
  const [sectionFilter, setSectionFilter] = useState(sectionParam);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = React.useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (sectionParam) {
      setSectionFilter(sectionParam);
      setActiveFilter('All');
      return;
    }
    if (courseParam) {
      setSectionFilter('');
      setActiveFilter(courseParam);
    }
  }, [sectionParam, courseParam]);

  const headerSubtitle = useMemo(() => {
    if (sectionFilter) return `Showing ${asText(sectionFilter)}`;
    if (activeFilter && activeFilter !== 'All') return `Showing ${asText(activeFilter)}`;
    return null;
  }, [sectionFilter, activeFilter]);

  const loadFilters = useCallback(async () => {
    try {
      const { courses, batch_years } = await yearbookService.getSearchFilters();
      const coursesSafe = Array.isArray(courses) ? courses : [];
      const yearsSafe = Array.isArray(batch_years) ? batch_years : [];
      const list = coursesSafe.length > 0 ? coursesSafe : yearsSafe;
      setFilters(normalizeFilters(list));
    } catch {
      setFilters(normalizeFilters([]));
    }
  }, []);

  const loadStudents = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const query: Record<string, unknown> = { page: 1 };
      const q = asText(debouncedSearch);
      if (q) query.q = q;

      const section = asText(sectionFilter);
      const course = asText(activeFilter);

      if (section) {
        query.section = section;
        if (!query.q) query.q = section;
      } else if (course && course !== 'All') {
        query.course = course;
      }

      const result = await yearbookService.getStudents(query);
      if (reqId !== requestIdRef.current) return;
      setStudents(normalizeStudents(result?.students));
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setError(asText(getApiErrorMessage(err, 'Unable to load students.'), 'Unable to load students.'));
      setStudents([]);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [debouncedSearch, activeFilter, sectionFilter]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const resetFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSectionFilter('');
    setActiveFilter('All');
    setSearch('');
    setDebouncedSearch('');
  }, []);

  const openStudent = async (student: DirectoryStudent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = asText(student.id);
    if (!id || checking) return;

    const { allowed } = await requireSubscription('profile', { allowOwnerId: id });
    if (!allowed) return;

    router.push(`/student/${id}` as unknown as Href);
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
      <ScreenHeader title="Student Directory" subtitle={headerSubtitle} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.searchContainer}>
          <FontAwesome name="search" size={18} color="#C7C7CC" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor="#C7C7CC"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {(search.length > 0 || sectionFilter || activeFilter !== 'All') && (
            <TouchableOpacity onPress={resetFilters} hitSlop={8} accessibilityLabel="Clear filters">
              <FontAwesome name="times-circle" size={18} color="#C7C7CC" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {sectionFilter ? (
            <TouchableOpacity
              key="section-chip"
              style={[styles.filterPill, styles.activeFilterPill]}
              onPress={resetFilters}
            >
              <Text style={[styles.filterText, styles.activeFilterText]}>
                {`Section: ${asText(sectionFilter)} ✕`}
              </Text>
            </TouchableOpacity>
          ) : null}

          {filters.map((f, index) => {
            const value = asText(f?.value ?? f?.label, `Filter ${index}`);
            const label = asText(f?.label ?? f?.value, value);
            const key = asText(f?.key, `${value || 'filter'}-${index}`);
            const isActive = !sectionFilter && activeFilter === value;

            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterPill, isActive && styles.activeFilterPill]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSectionFilter('');
                  setActiveFilter(value);
                }}
              >
                <Text style={[styles.filterText, isActive && styles.activeFilterText]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.listContainer}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#35408E" />
            </View>
          ) : error ? (
            <View style={styles.centerContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => void loadStudents()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : students.length > 0 ? (
            students.map((student, index) => {
              const name = asText(student.name, 'Student');
              const degree = asText(student.degree, 'NU Lipa');
              const year = asText(student.year);
              const section = asText(student.section);
              const image =
                typeof student.image === 'string' && student.image ? student.image : null;
              const rowKey = student.listKey || `student-${asText(student.id, 'id')}-${index}`;

              return (
                <TouchableOpacity
                  key={rowKey}
                  style={styles.studentCard}
                  onPress={() => openStudent(student)}
                >
                  {image ? (
                    <Image source={image} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <FontAwesome name="user" size={22} color="#8E8E93" />
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={styles.name}>{name}</Text>
                    <Text style={styles.degree}>{degree}</Text>
                    <View style={styles.yearBadge}>
                      <Text style={styles.yearText}>
                        {[year, section].filter(Boolean).join(' • ') || 'Student'}
                      </Text>
                    </View>
                  </View>
                  <FontAwesome name="chevron-right" size={14} color="#D1D1D6" />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No students found.</Text>
              {(sectionFilter || activeFilter !== 'All' || search) && (
                <TouchableOpacity style={styles.retryButton} onPress={resetFilters}>
                  <Text style={styles.retryButtonText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
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
    padding: 24,
    paddingBottom: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  filterScroll: {
    marginBottom: 24,
  },
  filterPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 10,
  },
  activeFilterPill: {
    backgroundColor: '#35408E',
    borderColor: '#35408E',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeFilterText: {
    color: 'white',
  },
  listContainer: {
    gap: 16,
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  avatarPlaceholder: {
    backgroundColor: '#E8EAEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  degree: {
    fontSize: 13,
    color: '#35408E',
    marginBottom: 6,
  },
  yearBadge: {
    backgroundColor: '#F2F2F7',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  yearText: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#35408E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
