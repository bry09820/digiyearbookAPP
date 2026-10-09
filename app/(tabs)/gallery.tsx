import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import yearbookService, { GalleryAlbum } from '@/services/yearbook';
import { getApiErrorMessage } from '@/services/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  SummaryStats,
  SearchField,
  FilterPills,
  premiumStyles,
  type FilterPill,
} from '@/components/premium';
import { asText } from '@/utils/text';

const { height } = Dimensions.get('window');

type GalleryFilter = 'All' | 'Recent' | 'Large';

export default function GalleryScreen() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<GalleryFilter>('All');
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [isGridVisible, setIsGridVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await yearbookService.getGalleryAlbums();
      setAlbums(data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load gallery.'));
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlbums();
  }, [loadAlbums]);

  const filterPills: FilterPill[] = [
    { key: 'all', label: 'All', value: 'All' },
    { key: 'recent', label: 'Recent', value: 'Recent' },
    { key: 'large', label: 'Large albums', value: 'Large' },
  ];

  const filteredAlbums = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = albums;

    if (activeFilter === 'Large') {
      list = list.filter((a) => Number(a.photos) >= 8);
    } else if (activeFilter === 'Recent') {
      list = [...list].slice(0, Math.max(6, Math.ceil(list.length / 2)));
    }

    if (!q) return list;
    return list.filter(
      (album) =>
        asText(album.title).toLowerCase().includes(q) ||
        asText(album.time).toLowerCase().includes(q) ||
        asText(album.description).toLowerCase().includes(q),
    );
  }, [albums, search, activeFilter]);

  const stats = useMemo(() => {
    const totalPhotos = albums.reduce((sum, a) => sum + (Number(a.photos) || 0), 0);
    return [
      { key: 'albums', label: 'Albums', value: albums.length },
      { key: 'photos', label: 'Photos', value: totalPhotos },
      {
        key: 'showing',
        label: 'Showing',
        value: filteredAlbums.length,
        hint: activeFilter !== 'All' ? activeFilter : undefined,
      },
    ];
  }, [albums, filteredAlbums.length, activeFilter]);

  const openViewer = async (album: GalleryAlbum) => {
    setSelectedAlbum(album);
    setPreviewImage(album.image);
    setIsViewerVisible(true);

    if (album.gridImages.length === 0) {
      setAlbumLoading(true);
      try {
        const detail = await yearbookService.getGalleryAlbum(album.id);
        setSelectedAlbum(detail);
        setPreviewImage(detail.image);
        setAlbums((prev) =>
          prev.map((a) => (String(a.id) === String(album.id) ? detail : a)),
        );
      } catch {
        // keep album with cover image only
      } finally {
        setAlbumLoading(false);
      }
    }
  };

  const openGrid = () => {
    setIsGridVisible(true);
  };

  const closeViewer = () => {
    setIsViewerVisible(false);
    setIsGridVisible(false);
    setSelectedAlbum(null);
    setPreviewImage(null);
  };

  const gridData =
    selectedAlbum && selectedAlbum.gridImages.length > 0
      ? selectedAlbum.gridImages
      : selectedAlbum?.image
        ? [selectedAlbum.image]
        : [];

  return (
    <SafeAreaView style={premiumStyles.screen}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Gallery"
        subtitle="Campus memories & albums"
        icon="image"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={premiumStyles.scrollContent}>
        <SummaryStats items={stats} />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search albums…"
        />

        <FilterPills
          items={filterPills}
          activeValue={activeFilter}
          onChange={(value) => setActiveFilter(value as GalleryFilter)}
        />

        {loading ? (
          <View style={premiumStyles.centerState}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={premiumStyles.mutedText}>Loading gallery…</Text>
          </View>
        ) : error ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.errorText}>{error}</Text>
            <TouchableOpacity style={premiumStyles.primaryButton} onPress={() => void loadAlbums()}>
              <Text style={premiumStyles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredAlbums.length === 0 ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.mutedText}>No albums found.</Text>
          </View>
        ) : (
          filteredAlbums.map((album) => (
            <TouchableOpacity
              key={String(album.id)}
              style={styles.albumCard}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void openViewer(album);
              }}
              activeOpacity={0.9}
            >
              <View style={styles.imageContainer}>
                {album.image ? (
                  <Image
                    source={album.image}
                    style={styles.albumImage}
                    contentFit="cover"
                    transition={400}
                  />
                ) : (
                  <View style={[styles.albumImage, styles.albumImagePlaceholder]}>
                    <FontAwesome name="image" size={36} color="#8E8E93" />
                  </View>
                )}
                <View style={styles.photoCountBadge}>
                  <Text style={styles.photoCountText}>{album.photos} Photos</Text>
                </View>
              </View>
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {album.title}
                  </Text>
                  <FontAwesome name="chevron-right" size={12} color="#C7C7CC" />
                </View>
                <Text style={styles.albumTime}>{album.time}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={isViewerVisible} transparent animationType="fade" onRequestClose={closeViewer}>
        <View style={styles.viewerOverlay}>
          <StatusBar style="light" />

          <View style={styles.viewerHeader}>
            <TouchableOpacity
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                isGridVisible ? setIsGridVisible(false) : closeViewer();
              }}
              style={styles.closeButton}
            >
              <FontAwesome name={isGridVisible ? 'chevron-left' : 'times'} size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {isGridVisible ? `All Photos (${selectedAlbum?.photos})` : selectedAlbum?.title}
            </Text>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            >
              <FontAwesome name="share-square-o" size={20} color="white" />
            </TouchableOpacity>
          </View>

          {!isGridVisible ? (
            <View style={styles.lightboxContainer}>
              <View style={styles.mainImageContainer}>
                {albumLoading ? (
                  <ActivityIndicator size="large" color="white" />
                ) : (
                  <Image
                    source={previewImage || selectedAlbum?.image || undefined}
                    style={styles.fullImage}
                    contentFit="contain"
                    transition={300}
                  />
                )}
              </View>

              <View style={styles.viewerFooter}>
                <View style={styles.albumInfo}>
                  <Text style={styles.photoCountBig}>{selectedAlbum?.photos} Photos in Album</Text>
                  <Text style={styles.albumDate}>{selectedAlbum?.time}</Text>
                </View>
                <TouchableOpacity
                  style={styles.viewAllBtn}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openGrid();
                  }}
                >
                  <Text style={styles.viewAllBtnText}>View All Photos</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.gridContainer}>
              <FlatList
                data={gridData}
                numColumns={3}
                keyExtractor={(item, index) => `${item}-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPreviewImage(item);
                      setIsGridVisible(false);
                    }}
                  >
                    <Image source={item} style={styles.gridImage} contentFit="cover" />
                  </TouchableOpacity>
                )}
                contentContainerStyle={styles.gridList}
                ListEmptyComponent={
                  <View style={premiumStyles.centerState}>
                    <Text style={styles.emptyGridText}>No photos in this album.</Text>
                  </View>
                }
              />
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  albumCard: {
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  imageContainer: {
    position: 'relative',
    height: 180,
    backgroundColor: '#F0F2F8',
  },
  albumImage: {
    width: '100%',
    height: '100%',
  },
  albumImagePlaceholder: {
    backgroundColor: '#E8EAEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(28, 36, 86, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  info: {
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  albumTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  albumTime: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerTitle: {
    flex: 1,
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginHorizontal: 10,
  },
  shareButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxContainer: {
    flex: 1,
  },
  mainImageContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  viewerFooter: {
    padding: 30,
    paddingBottom: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  albumInfo: {
    marginBottom: 20,
  },
  photoCountBig: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  albumDate: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  viewAllBtn: {
    backgroundColor: 'white',
    height: 55,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewAllBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  gridContainer: {
    flex: 1,
  },
  gridList: {
    padding: 2,
  },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  emptyGridText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
});
