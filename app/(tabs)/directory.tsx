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
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import yearbookService, { type DirectoryStudent } from '@/services/yearbook';
import { getApiErrorMessage } from '@/services/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  SummaryStats,
  SearchField,
  FilterPills,
  InitialsAvatar,
  premiumStyles,
  type FilterPill,
} from '@/components/premium';
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
    return 'Browse classmates & batchmates';
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSectionFilter('');
    setActiveFilter('All');
    setSearch('');
    setDebouncedSearch('');
  }, []);

  const openStudent = (student: DirectoryStudent) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = asText(student.id);
    if (!id) return;
    router.push(`/student/${id}` as unknown as Href);
  };

  const filterPills: FilterPill[] = useMemo(() => {
    const pills: FilterPill[] = filters.map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
    }));
    if (sectionFilter) {
      return [
        {
          key: 'section-active',
          label: `Section: ${sectionFilter}`,
          value: '__section__',
        },
        ...pills,
      ];
    }
    return pills;
  }, [filters, sectionFilter]);

  const activePillValue = sectionFilter ? '__section__' : activeFilter;

  const stats = useMemo(() => {
    const programs = new Set(students.map((s) => s.degree).filter(Boolean));
    const batches = new Set(students.map((s) => s.year).filter(Boolean));
    return [
      { key: 'total', label: 'Students', value: students.length },
      { key: 'programs', label: 'Programs', value: programs.size },
      { key: 'batches', label: 'Batches', value: batches.size },
    ];
  }, [students]);

  return (
    <SafeAreaView style={premiumStyles.screen}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Student Directory"
        subtitle={headerSubtitle}
        icon="users"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={premiumStyles.scrollContent}>
        <SummaryStats items={stats} />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search students by name, ID…"
          onClear={
            sectionFilter || activeFilter !== 'All'
              ? () => {
                  setSectionFilter('');
                  setActiveFilter('All');
                }
              : undefined
          }
          showClear={search.length > 0 || Boolean(sectionFilter) || activeFilter !== 'All'}
        />

        <FilterPills
          items={filterPills}
          activeValue={activePillValue}
          onChange={(value) => {
            if (value === '__section__') {
              resetFilters();
              return;
            }
            setSectionFilter('');
            setActiveFilter(value);
          }}
        />

        {loading ? (
          <View style={premiumStyles.centerState}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={premiumStyles.mutedText}>Loading students…</Text>
          </View>
        ) : error ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.errorText}>{error}</Text>
            <TouchableOpacity style={premiumStyles.primaryButton} onPress={() => void loadStudents()}>
              <Text style={premiumStyles.primaryButtonText}>Retry</Text>
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
                activeOpacity={0.85}
              >
                <InitialsAvatar name={name} image={image} size={56} />
                <View style={styles.info}>
                  <Text style={styles.name}>{name}</Text>
                  <Text style={styles.degree}>{degree}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.yearBadge}>
                      <Text style={styles.yearText}>
                        {[year, section].filter(Boolean).join(' · ') || 'Student'}
                      </Text>
                    </View>
                  </View>
                </View>
                <FontAwesome name="chevron-right" size={12} color="#C7C7CC" />
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.mutedText}>No students found.</Text>
            {(sectionFilter || activeFilter !== 'All' || search) && (
              <TouchableOpacity style={premiumStyles.primaryButton} onPress={resetFilters}>
                <Text style={premiumStyles.primaryButtonText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    gap: 14,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  degree: {
    fontSize: 13,
    color: '#35408E',
    fontWeight: '600',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  yearBadge: {
    backgroundColor: '#F0F2F8',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  yearText: {
    fontSize: 10,
    color: '#5C6B8A',
    fontWeight: '700',
  },
});
