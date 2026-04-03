import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleProp, Text, TextProps, TextStyle } from 'react-native';

type AnimatedValueTextProps = TextProps & {
    text: string;
    freezeWhile?: boolean;
    settleMs?: number;
    animated?: boolean;
    style?: StyleProp<TextStyle>;
};

export function AnimatedValueText({
    text,
    freezeWhile = false,
    settleMs = 140,
    animated = Platform.OS !== 'android',
    style,
    ...textProps
}: AnimatedValueTextProps) {
    const anim = useRef(new Animated.Value(1)).current;
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [displayedText, setDisplayedText] = useState(text);

    useEffect(() => {
        if (!animated) {
            if (displayedText !== text) {
                setDisplayedText(text);
            }
            return () => {
                if (settleTimerRef.current) {
                    clearTimeout(settleTimerRef.current);
                    settleTimerRef.current = null;
                }
            };
        }

        if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }

        if (freezeWhile || displayedText === text) {
            return () => {
                if (settleTimerRef.current) {
                    clearTimeout(settleTimerRef.current);
                    settleTimerRef.current = null;
                }
            };
        }

        settleTimerRef.current = setTimeout(() => {
            setDisplayedText(text);
            anim.setValue(0.965);
            Animated.spring(anim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 8,
                tension: 120,
            }).start();
            settleTimerRef.current = null;
        }, settleMs);

        return () => {
            if (settleTimerRef.current) {
                clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        };
    }, [anim, animated, displayedText, freezeWhile, settleMs, text]);

    if (!animated) {
        return (
            <Text {...textProps} style={style}>
                {text}
            </Text>
        );
    }

    return (
        <Animated.Text
            {...textProps}
            style={[
                style,
                {
                    opacity: anim,
                    transform: [{ scale: anim }],
                },
            ]}
        >
            {displayedText}
        </Animated.Text>
    );
}
