import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, TextProps, TextStyle } from 'react-native';

type AnimatedValueTextProps = TextProps & {
    text: string;
    freezeWhile?: boolean;
    settleMs?: number;
    style?: StyleProp<TextStyle>;
};

export function AnimatedValueText({
    text,
    freezeWhile = false,
    settleMs = 140,
    style,
    ...textProps
}: AnimatedValueTextProps) {
    const anim = useRef(new Animated.Value(1)).current;
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [displayedText, setDisplayedText] = useState(text);

    useEffect(() => {
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
    }, [anim, displayedText, freezeWhile, settleMs, text]);

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
