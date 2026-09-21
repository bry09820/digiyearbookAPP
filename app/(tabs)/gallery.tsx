import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Modal, Dimensions, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import yearbookService, { GalleryAlbum } from '@/services/yearbook';
import { getApiErrorMessage } from '@/services/api';
import { ScreenHeader } from '@/components/ScreenHeader';

const { height } = Dimensions.get('window');

export default function GalleryScreen() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    loadAlbums();
  }, [loadAlbums]);

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
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <ScreenHeader title="Gallery" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#35408E" />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadAlbums}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : albums.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No albums found.</Text>
          </View>
        ) : (
          albums.map((album) => (
            <TouchableOpacity
              key={String(album.id)}
              style={styles.albumCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                openViewer(album);
              }}
              activeOpacity={0.9}
            >
              <View style={styles.imageContainer}>
                {album.image ? (
                  <Image
                    source={album.image}
                    style={styles.albumImage}
                    contentFit="cover"
                    transition={500}
                  />
                ) : (
                  <View style={[styles.albumImage, styles.albumImagePlaceholder]}>
                    <FontAwesome name="image" size={40} color="#8E8E93" />
                  </View>
                )}
                <View style={styles.photoCountBadge}>
                  <Text style={styles.photoCountText}>{album.photos} Photos</Text>
                </View>
              </View>
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Text style={styles.albumTitle}>{album.title}</Text>
                  <FontAwesome name="chevron-right" size={14} color="#C7C7CC" />
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPreviewImage(item);
                      setIsGridVisible(false);
                    }}
                  >
                    <Image source={item} style={styles.gridImage} contentFit="cover" />
                  </TouchableOpacity>
                )}
                contentContainerStyle={styles.gridList}
                ListEmptyComponent={
                  <View style={styles.centerContainer}>
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
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
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
  emptyGridText: {
    color: 'rgba(255,255,255,0.6)',
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
  albumCard: {
    marginBottom: 32,
    backgroundColor: 'white',
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  imageContainer: {
    position: 'relative',
    height: 240,
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
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#35408E',
  },
  info: {
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  albumTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  albumTime: {
    fontSize: 14,
    color: '#8E8E93',
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
});
