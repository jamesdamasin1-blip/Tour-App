import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView } from './GlassView';

interface QRScannerModalProps {
    isVisible: boolean;
    onClose: () => void;
    onScan: (data: string) => void;
}

export const QRScannerModal = ({ isVisible, onClose, onScan }: QRScannerModalProps) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const scanTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

    useEffect(() => {
        if (isVisible && !permission?.granted) {
            requestPermission();
        }
        return () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); };
    }, [isVisible, permission, requestPermission]);

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);
        onScan(data);
        scanTimerRef.current = setTimeout(() => setScanned(false), 2000);
    };

    if (!permission) {
        return null;
    }

    return (
        <Modal
            visible={isVisible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {!permission.granted ? (
                    <View style={styles.permissionContainer}>
                        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
                        <GlassView intensity={40} borderRadius={32} style={styles.permissionContent}>
                            <Feather name="camera" size={48} color="#9EB294" />
                            <Text style={styles.permissionText}>Camera access is required to scan QR codes</Text>
                            <TouchableOpacity style={styles.button} onPress={requestPermission}>
                                <Text style={styles.buttonText}>GRANT PERMISSION</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                                <Text style={styles.cancelText}>CANCEL</Text>
                            </TouchableOpacity>
                        </GlassView>
                    </View>
                ) : (
                    <>
                        <CameraView
                            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                            barcodeScannerSettings={{
                                barcodeTypes: ["qr"],
                            }}
                            style={StyleSheet.absoluteFill}
                        />
                        
                        {/* Overlay */}
                        <View style={styles.overlay}>
                            <View style={styles.topOverlay}>
                                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                                    <BlurView intensity={60} tint="dark" style={styles.closeBlur}>
                                        <Feather name="x" size={24} color="#FFF" />
                                    </BlurView>
                                </TouchableOpacity>
                                <Text style={styles.scanText}>ALIGN QR CODE WITHIN FRAME</Text>
                            </View>
                            
                            <View style={styles.middleRow}>
                                <View style={styles.sideOverlay} />
                                <View style={styles.finder}>
                                    {/* Corner Accents */}
                                    <View style={[styles.corner, styles.topLeft]} />
                                    <View style={[styles.corner, styles.topRight]} />
                                    <View style={[styles.corner, styles.bottomLeft]} />
                                    <View style={[styles.corner, styles.bottomRight]} />
                                    {scanned && (
                                        <View style={styles.scannedHighlight}>
                                            <Feather name="check" size={64} color="#FFF" />
                                        </View>
                                    )}
                                </View>
                                <View style={styles.sideOverlay} />
                            </View>
                            
                            <View style={styles.bottomOverlay}>
                                <Text style={styles.hintText}>Scanning will happen automatically</Text>
                            </View>
                        </View>
                    </>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    permissionContent: {
        padding: 32,
        alignItems: 'center',
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    permissionText: {
        color: '#F2F0E8',
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 24,
        marginBottom: 32,
    },
    button: {
        backgroundColor: '#5D6D54',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 16,
        width: '100%',
    },
    buttonText: {
        color: '#FFF',
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: 1,
    },
    cancelButton: {
        marginTop: 16,
        padding: 12,
    },
    cancelText: {
        color: '#9EB294',
        fontWeight: '700',
    },
    overlay: {
        flex: 1,
    },
    topOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    middleRow: {
        flexDirection: 'row',
        height: 280,
    },
    sideOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    bottomOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        paddingTop: 40,
    },
    finder: {
        width: 280,
        height: 280,
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: '#9EB294',
        borderWidth: 4,
    },
    topLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 24,
    },
    topRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 24,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 24,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 24,
    },
    closeBtn: {
        position: 'absolute',
        top: 60,
        right: 24,
    },
    closeBlur: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    scanText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
        marginTop: 40,
    },
    hintText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: '700',
    },
    scannedHighlight: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(93, 109, 84, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 24,
    }
});
