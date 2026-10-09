import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getApiErrorMessage } from '@/services/api';
import yearbookService, { FacultyMember } from '@/services/yearbook';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ChatModal, type ChatPeer } from '@/modules/chat';
import {
  SummaryStats,
  SearchField,
  FilterPills,
  InitialsAvatar,
  premiumStyles,
  type FilterPill,
} from '@/components/premium';
import { asText } from '@/utils/text';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = (width - 16 * 2 - 12) / 2;

type DepartmentGroup = {
  name: string;
  faculty: FacultyMember[];
};

export default function FacultyScreen() {
  const [departments, setDepartments] = useState<DepartmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeDept, setActiveDept] = useState('All');
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  const loadFaculty = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await yearbookService.getFaculty();
      setDepartments(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load faculty.'));
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaculty();
  }, [loadFaculty]);

  const filterPills: FilterPill[] = useMemo(() => {
    const pills: FilterPill[] = [{ key: 'all', label: 'All', value: 'All' }];
    departments.forEach((dept, index) => {
      pills.push({
        key: `dept-${dept.name}-${index}`,
        label: dept.name,
        value: dept.name,
      });
    });
    return pills;
  }, [departments]);

  const allFaculty = useMemo(
    () => departments.flatMap((dept) => dept.faculty.map((member) => ({ ...member, department: dept.name }))),
    [departments],
  );

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allFaculty.filter((member) => {
      const deptOk = activeDept === 'All' || member.department === activeDept;
      if (!deptOk) return false;
      if (!q) return true;
      return (
        member.name.toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q) ||
        (member.department || '').toLowerCase().includes(q) ||
        (member.email || '').toLowerCase().includes(q)
      );
    });
  }, [allFaculty, activeDept, search]);

  const stats = useMemo(() => {
    const roles = new Set(allFaculty.map((m) => m.role).filter(Boolean));
    return [
      { key: 'total', label: 'Faculty', value: allFaculty.length },
      { key: 'depts', label: 'Departments', value: departments.length },
      { key: 'roles', label: 'Roles', value: roles.size },
    ];
  }, [allFaculty, departments.length]);

  const toggleModal = (visible: boolean, member: FacultyMember | null = null) => {
    if (visible && member) {
      setSelectedFaculty(member);
      setIsModalVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setIsModalVisible(false);
        setSelectedFaculty(null);
      });
    }
  };

  return (
    <SafeAreaView style={premiumStyles.screen}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Faculty"
        subtitle="Educators & staff directory"
        icon="graduation-cap"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={premiumStyles.scrollContent}>
        <SummaryStats items={stats} />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search faculty by name, role…"
        />

        <FilterPills
          items={filterPills}
          activeValue={activeDept}
          onChange={setActiveDept}
        />

        {loading ? (
          <View style={premiumStyles.centerState}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={premiumStyles.mutedText}>Loading faculty…</Text>
          </View>
        ) : error ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.errorText}>{error}</Text>
            <TouchableOpacity style={premiumStyles.primaryButton} onPress={() => void loadFaculty()}>
              <Text style={premiumStyles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredFaculty.length === 0 ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.mutedText}>No faculty members found.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredFaculty.map((member) => (
              <TouchableOpacity
                key={String(member.id)}
                style={styles.facultyCard}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleModal(true, member);
                }}
                activeOpacity={0.88}
              >
                <View style={styles.imageWrapper}>
                  {member.image ? (
                    <Image
                      source={member.image}
                      style={styles.facultyImage}
                      contentFit="cover"
                      transition={400}
                    />
                  ) : (
                    <View style={[styles.facultyImage, styles.facultyImagePlaceholder]}>
                      <Text style={styles.initialsLarge}>
                        {asText(member.name)
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join('')
                          .toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText} numberOfLines={1}>
                      {member.role}
                    </Text>
                  </View>
                </View>
                <Text style={styles.memberName} numberOfLines={2}>
                  {member.name}
                </Text>
                <Text style={styles.memberDept} numberOfLines={1}>
                  {member.department || 'NU Lipa'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={isModalVisible} transparent animationType="none" onRequestClose={() => toggleModal(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleModal(false);
              }}
            />
          </Animated.View>

          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.profileModalContent}>
                <View style={styles.blueHeader} />
                <View style={styles.profileInfoSection}>
                  <View style={styles.avatarWrapper}>
                    <InitialsAvatar
                      name={selectedFaculty?.name}
                      image={selectedFaculty?.image}
                      size={140}
                    />
                    <View style={styles.onlineDot} />
                  </View>

                  <Text style={styles.userName}>{selectedFaculty?.name}</Text>
                  <Text style={styles.userDegree}>{selectedFaculty?.role}</Text>
                  <Text style={styles.userYear}>National University Lipa</Text>
                  {selectedFaculty?.email ? (
                    <Text style={styles.userEmail}>{selectedFaculty.email}</Text>
                  ) : null}

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => {
                        if (!selectedFaculty) return;
                        const peerId = asText(selectedFaculty.id);
                        if (!peerId) return;
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setChatPeer({
                          id: peerId,
                          name: asText(selectedFaculty.name, 'Faculty'),
                          image: selectedFaculty.image,
                          kind: 'faculty',
                        });
                        setChatVisible(true);
                      }}
                    >
                      <Text style={styles.primaryActionButtonText}>Message Professor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.yearbookButton}
                      onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                    >
                      <Text style={styles.yearbookButtonText}>View Publications</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.contentSection}>
                  <View style={styles.sectionHeader}>
                    <FontAwesome name="book" size={16} color="#35408E" style={{ marginRight: 10 }} />
                    <Text style={styles.sectionTitle}>BIOGRAPHY</Text>
                  </View>
                  <Text style={styles.aboutText}>{selectedFaculty?.bio}</Text>
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <ChatModal
        visible={chatVisible}
        peer={chatPeer}
        onClose={() => {
          setChatVisible(false);
          setChatPeer(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  facultyCard: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#F0F2F8',
  },
  facultyImage: {
    width: '100%',
    height: '100%',
  },
  facultyImagePlaceholder: {
    backgroundColor: '#E8EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsLarge: {
    fontSize: 36,
    fontWeight: '800',
    color: '#35408E',
    letterSpacing: 1,
  },
  roleBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(28, 36, 86, 0.92)',
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  roleText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  memberDept: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  absoluteFill: {
    ...StyleSheet.absoluteFill,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: height * 0.9,
    overflow: 'hidden',
  },
  profileModalContent: {
    flex: 1,
  },
  blueHeader: {
    height: 140,
    backgroundColor: '#1C2456',
    width: '100%',
  },
  profileInfoSection: {
    alignItems: 'center',
    marginTop: -70,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 70,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    overflow: 'visible',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22C55E',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
    textAlign: 'center',
  },
  userDegree: {
    fontSize: 15,
    color: '#35408E',
    fontWeight: '600',
    marginBottom: 2,
  },
  userYear: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#35408E',
    marginBottom: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 24,
  },
  primaryActionButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#35408E',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  yearbookButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35408E',
  },
  yearbookButtonText: {
    color: '#35408E',
    fontWeight: '700',
    fontSize: 13,
  },
  contentSection: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: 0.5,
  },
  aboutText: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 22,
  },
});
