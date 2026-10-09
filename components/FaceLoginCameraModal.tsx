import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type FaceLoginCameraModalProps = {
  visible: boolean;
  /** Called with raw JPEG base64 (no data-URI prefix) after a successful capture. */
  onCapture: (imageBase64: string) => void | Promise<void>;
  onClose: () => void;
  /** When true, disable capture/close while the parent verifies the image. */
  verifying?: boolean;
  title?: string;
  verifyingLabel?: string;
  permissionBody?: string;
  closeAccessibilityLabel?: string;
  secondaryCloseLabel?: string;
};

/**
 * Full-screen front-camera modal for face recognition (login or registration).
 * Captures a photo and returns base64 JPEG data for the backend.
 */
export function FaceLoginCameraModal({
  visible,
  onCapture,
  onClose,
  verifying = false,
  title = 'Face Recognition',
  verifyingLabel = 'Verifying…',
  permissionBody = 'Allow camera access so we can capture your face for sign-in.',
  closeAccessibilityLabel = 'Close face recognition',
  secondaryCloseLabel = 'Back to Sign In',
}: FaceLoginCameraModalProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = capturing || verifying;

  const handleClose = () => {
    if (busy) return;
    setLocalError(null);
    setCameraReady(false);
    onClose();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || busy) return;

    setLocalError(null);
    setCapturing(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        shutterSound: false,
      });

      const base64 = photo?.base64;
      if (!base64) {
        setLocalError('Could not read the captured image. Please try again.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await onCapture(base64);
    } catch {
      setLocalError('Unable to capture photo. Please try again.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCapturing(false);
    }
  };

  const renderBody = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={styles.centeredMessage}>
          <MaterialIcons name="videocam-off" size={48} color="#FFFFFF" />
          <Text style={styles.messageTitle}>Camera unavailable on web</Text>
          <Text style={styles.messageBody}>
            Face recognition sign-in requires the iOS or Android app.
          </Text>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.centeredMessage}>
          <ActivityIndicator color="#FFFFFF" size="large" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centeredMessage}>
          <MaterialIcons name="camera-alt" size={48} color="#FFFFFF" />
          <Text style={styles.messageTitle}>Camera access needed</Text>
          <Text style={styles.messageBody}>{permissionBody}</Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => void requestPermission()}
            accessibilityRole="button"
            accessibilityLabel="Grant camera permission"
          >
            <Text style={styles.permissionButtonText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          mirror
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
        />

        <View style={styles.faceGuide} pointerEvents="none">
          <View style={styles.faceOval} />
          <Text style={styles.guideHint}>Position your face in the oval</Text>
        </View>

        {(capturing || verifying) && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={styles.busyText}>
              {verifying ? verifyingLabel : 'Capturing…'}
            </Text>
          </View>
        )}
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
          >
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.preview}>{renderBody()}</View>

        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}

        {permission?.granted && Platform.OS !== 'web' ? (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.captureButton, busy ? styles.captureButtonDisabled : null]}
              onPress={() => void handleCapture()}
              disabled={busy || !cameraReady}
              accessibilityRole="button"
              accessibilityLabel="Capture face photo"
            >
              <View style={styles.captureInner} />
            </TouchableOpacity>
            <Text style={styles.captureLabel}>Tap to capture</Text>
          </View>
        ) : (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.secondaryClose}
              onPress={handleClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={secondaryCloseLabel}
            >
              <Text style={styles.secondaryCloseText}>{secondaryCloseLabel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 44,
  },
  preview: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  messageTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  messageBody: {
    marginTop: 8,
    fontSize: 15,
    color: '#C7C7CC',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: 24,
    backgroundColor: '#35408E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  faceGuide: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceOval: {
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  guideHint: {
    marginTop: 20,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  busyText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  captureLabel: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#C7C7CC',
  },
  secondaryClose: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#35408E',
    backgroundColor: '#F0F2F8',
  },
  secondaryCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#35408E',
  },
});
