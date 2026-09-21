import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Dimensions, Modal, Animated, ActivityIndicator, Linking, Alert } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getApiErrorMessage } from '@/services/api';
import yearbookService, { FacultyMember } from '@/services/yearbook';
import { ScreenHeader } from '@/components/ScreenHeader';
import { asText } from '@/utils/text';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width * 0.62, 260);

type DepartmentGroup = {
  name: string;
  faculty: FacultyMember[];
};

export default function FacultyScreen() {
  const [departments, setDepartments] = useState<DepartmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

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
    loadFaculty();
  }, [loadFaculty]);

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
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <ScreenHeader title="Faculty" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Our Educators</Text>
          <Text style={styles.pageSubtitle}>Swipe to see the brilliance behind NU Lipa</Text>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#35408E" />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadFaculty}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : departments.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No faculty members found.</Text>
          </View>
        ) : (
          departments.map((dept, dIndex) => (
            <View key={`${dept.name}-${dIndex}`} style={styles.section}>
              <View style={styles.deptHeader}>
                <Text style={styles.deptName}>{dept.name}</Text>
                <View style={styles.deptLine} />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
                decelerationRate="fast"
                snapToInterval={CARD_WIDTH + 16}
              >
                {dept.faculty.map((member) => (
                  <TouchableOpacity
                    key={String(member.id)}
                    style={styles.facultyCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleModal(true, member);
                    }}
                  >
                    <View style={styles.imageWrapper}>
                      {member.image ? (
                        <Image
                          source={member.image}
                          style={styles.facultyImage}
                          contentFit="cover"
                          transition={500}
                        />
                      ) : (
                        <View style={[styles.facultyImage, styles.facultyImagePlaceholder]}>
                          <FontAwesome name="user" size={36} color="#8E8E93" />
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
                  </TouchableOpacity>
                ))}
                <View style={{ width: 16 }} />
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={isModalVisible} transparent animationType="none" onRequestClose={() => toggleModal(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                    <Image
                      source={selectedFaculty?.image ? selectedFaculty.image : undefined}
                      style={[styles.largeAvatar, !selectedFaculty?.image && styles.avatarPlaceholder]}
                      contentFit="cover"
                    />
                    <View style={[styles.medalBadge, { backgroundColor: '#4CD964' }]} />
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
                        const email = asText(selectedFaculty?.email);
                        if (!email) {
                          Alert.alert(
                            'Messaging unavailable',
                            'This faculty member has not shared a public email yet.',
                          );
                          return;
                        }
                        void Linking.openURL(
                          `mailto:${email}?subject=${encodeURIComponent('Hello from NU Lipa Yearbook')}`,
                        );
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }}
                    >
                      <Text style={styles.primaryActionButtonText}>Message Professor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.yearbookButton}
                      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  scrollContent: {
    paddingVertical: 24,
    paddingBottom: 100,
  },
  pageHeader: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  centerContainer: {
    padding: 40,
    alignItems: 'center',
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
  section: {
    marginBottom: 40,
  },
  deptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  deptName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#35408E',
    marginRight: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  deptLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  horizontalScroll: {
    paddingHorizontal: 24,
  },
  facultyCard: {
    width: CARD_WIDTH,
    backgroundColor: 'white',
    borderRadius: 32,
    padding: 16,
    marginRight: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    backgroundColor: '#F0F2F8',
  },
  facultyImage: {
    width: '100%',
    height: '100%',
  },
  facultyImagePlaceholder: {
    backgroundColor: '#E8EAEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(53, 64, 142, 0.9)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  roleText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    textAlign: 'center',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  absoluteFill: {
    ...StyleSheet.absoluteFill,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: height * 0.9,
    overflow: 'hidden',
  },
  profileModalContent: {
    flex: 1,
  },
  blueHeader: {
    height: 150,
    backgroundColor: '#35408E',
    width: '100%',
  },
  profileInfoSection: {
    alignItems: 'center',
    marginTop: -70,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  largeAvatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    backgroundColor: '#F0F2F8',
  },
  avatarPlaceholder: {
    backgroundColor: '#D1D1D6',
  },
  medalBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
  },
  userName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 6,
    textAlign: 'center',
  },
  userDegree: {
    fontSize: 16,
    color: '#35408E',
    fontWeight: '500',
    marginBottom: 4,
  },
  userYear: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#35408E',
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 30,
  },
  primaryActionButton: {
    flex: 1,
    height: 50,
    backgroundColor: '#35408E',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#35408E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  primaryActionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  yearbookButton: {
    flex: 1,
    height: 50,
    backgroundColor: 'white',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35408E',
  },
  yearbookButtonText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 14,
  },
  contentSection: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1C1C1E',
    letterSpacing: 0.5,
  },
  aboutText: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 22,
  },
});
