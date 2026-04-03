import { Header } from '@/components/Header';
import React from 'react';
import { View } from 'react-native';

type TripDetailHeaderProps = {
    title: string;
    onBack: () => void;
};

export function TripDetailHeader({
    title,
    onBack,
}: TripDetailHeaderProps) {
    return (
        <Header
            title={title}
            showBack
            onBack={onBack}
            showThemeToggle={false}
            rightElement={<View />}
        />
    );
}
