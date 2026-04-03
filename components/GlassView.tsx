import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, ViewProps } from 'react-native';
import { useStore } from '@/src/store/useStore';

interface GlassViewProps extends ViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    borderRadius?: number;
    borderColor?: string;
    borderWidth?: number;
    backgroundColor?: string;
    hasShadow?: boolean;
    shadowColor?: string;
    shadowOffset?: { width: number; height: number };
    shadowOpacity?: number;
    shadowRadius?: number;
    elevation?: number;
}

/**
 * Apple-Style Glass Card — Square-Artifact-Free
 *
 * Root cause of Android "square" bug:
 * → Android's `elevation` shadow is clipped by `overflow: 'hidden'`.
 * → So if you have elevation + overflow:hidden on the SAME view, the
 *   shadow becomes a visible rectangular border, not a soft glow.
 *
 * Solution:
 * → On Android: SEPARATE the shadow (outer View, no overflow) from
 *   the clip (inner View, overflow:hidden, but NO elevation).
 * → On iOS: The standard approach (transparent outer View with shadow
 *   props, inner View clips content) works perfectly.
 *
 * Layer Stack (Android):
 *   androidShadow   [has elevation + backgroundColor, NO overflow]
 *   └ clipMask      [has overflow:hidden + borderRadius, NO elevation]
 *       ├ solidBg
 *       └ {children}
 *
 * Layer Stack (iOS):
 *   iosShadow       [transparent, has shadowColor/Radius/Opacity]
 *   └ clipMask      [has overflow:hidden + borderRadius, BlurView inside]
 *       ├ BlurView
 *       ├ glassTint
 *       ├ highlight
 *       └ {children}
 */
export const GlassView: React.FC<GlassViewProps> = ({
    intensity = 40,
    tint = 'light',
    borderRadius = 28,
    borderColor = 'rgba(255, 255, 255, 0.4)',
    borderWidth = 1,
    backgroundColor,
    hasShadow = false,
    shadowColor = '#000',
    shadowOffset = { width: 0, height: 8 },
    shadowOpacity = 0.08,
    shadowRadius = 20,
    elevation = 5,
    children,
    style,
    ...props
}) => {
    const theme = useStore(state => state.theme);
    const isDark = theme === 'dark';

    const defaultBg = isDark ? 'rgba(40, 44, 38, 0.85)' : 'rgba(255, 255, 255, 0.85)';
    const defaultBorder = isDark ? 'rgba(93, 109, 84, 0.3)' : 'rgba(255, 255, 255, 0.4)';
    const defaultTint = isDark ? 'dark' : 'light';

    const finalBg = backgroundColor || defaultBg;
    const finalBorder = borderColor || defaultBorder;
    const finalTint = tint || defaultTint;

    // Split style into layout (margin, flex, size) and content (padding)
    const flatStyle = StyleSheet.flatten(style || {});
    const {
        padding,
        paddingHorizontal,
        paddingVertical,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        margin,
        marginHorizontal,
        marginVertical,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        flex,
        flexGrow,
        flexShrink,
        width,
        height,
        minWidth,
        minHeight,
        maxWidth,
        maxHeight,
        position,
        top,
        bottom,
        left,
        right,
        alignSelf: _alignSelf,
        ...otherStyles
    } = flatStyle as any;

    const layoutStyle = {
        margin, marginHorizontal, marginVertical, marginTop, marginBottom, marginLeft, marginRight,
        flex, flexGrow, flexShrink, alignSelf: _alignSelf, width, height, minWidth, minHeight, maxWidth, maxHeight,
        position, top, bottom, left, right
    };

    const contentStyle = {
        padding, paddingHorizontal, paddingVertical, paddingTop, paddingBottom, paddingLeft, paddingRight
    };

    const hasFlexOrHeight = flex !== undefined || flexGrow !== undefined || height !== undefined || minHeight !== undefined;

    if (Platform.OS === 'android') {
        const resolvedBg = finalBg;
        return (
            <View
                style={[
                    styles.androidShadow,
                    {
                        borderRadius,
                        elevation: hasShadow ? elevation : 0,
                        backgroundColor: resolvedBg.includes('rgba')
                            ? resolvedBg.replace(/[\d.]+\)$/, isDark ? '0.98)' : '0.95)')
                            : resolvedBg,
                    },
                    layoutStyle,
                ]}
                {...props}
            >
                <View style={[
                    styles.androidClip, 
                    { borderRadius, borderColor: finalBorder, borderWidth },
                    hasFlexOrHeight && { flex: 1 }
                ]}>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: resolvedBg }]} />
                    
                    {/* Inner content container - Explicitly DO NOT apply shadow/elevation here */}
                    <View style={[
                        styles.contentContainer, 
                        contentStyle,
                        (() => {
                            const { elevation: _, ...safeStyles } = otherStyles;
                            return safeStyles;
                        })(),
                        hasFlexOrHeight && { flex: 1 }
                    ]}>
                        {children}
                    </View>
                </View>
            </View>
        );
    }

    const iosShadow = hasShadow ? {
        shadowColor,
        shadowOffset,
        shadowOpacity,
        shadowRadius,
    } : {};

    return (
        <View
            style={[
                styles.iosShadowShell,
                iosShadow,
                { borderRadius },
                layoutStyle,
            ]}
            {...props}
        >
            <View style={[
                styles.iosClipMask, 
                { borderRadius, borderColor: finalBorder, borderWidth },
                hasFlexOrHeight && { flex: 1 }
            ]}>
                <BlurView
                    intensity={intensity}
                    tint={finalTint}
                    style={StyleSheet.absoluteFill}
                />

                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)' },
                    ]}
                />

                <View style={styles.glassHighlight} />

                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        styles.innerEdge,
                        { borderRadius, borderColor: finalBorder },
                    ]}
                    pointerEvents="none"
                />

                <View style={[
                    styles.contentContainer, 
                    contentStyle, 
                    otherStyles,
                    hasFlexOrHeight && { flex: 1 }
                ]}>
                    {children}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    /* Generic */
    contentContainer: {
    },
    /* Android */
    androidShadow: {
    },
    androidClip: {
        overflow: 'hidden',
    },
    /* iOS */
    iosShadowShell: {
        backgroundColor: 'transparent',
    },
    iosClipMask: {
        overflow: 'hidden',
    },
    /* Shared decorative layers (iOS only now) */
    glassHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1.5,
        backgroundColor: 'rgba(255,255,255,0.2)',
        zIndex: 1,
    },
    innerEdge: {
        borderWidth: 0.5,
        opacity: 0.4,
        zIndex: 2,
    },
});
