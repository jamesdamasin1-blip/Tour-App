import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Activity } from '@/src/types/models';
import { ActivityListItem } from '@/components/ActivityListItem';
import { useStore } from '@/src/store/useStore';

interface Props {
    type: 'planned' | 'spontaneous';
    activities: Activity[];
    onPress?: (activity: Activity) => void;
    onEdit?: (activity: Activity) => void;
    onDelete?: (activity: Activity) => void;
    onToggleComplete?: (activityId: string) => void;
}

const BADGE = {
    planned:     { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6', label: 'PLANNED' },
    spontaneous: { bg: 'rgba(245, 158, 11, 0.15)',  text: '#F59E0B', label: 'SPONTANEOUS' },
};

export const ActivityGroup = React.memo(({
    type, activities, onPress, onEdit, onDelete, onToggleComplete,
}: Props) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const badge = BADGE[type];

    const filtered = useMemo(
        () => activities.filter(a => type === 'planned' ? !a.isSpontaneous : !!a.isSpontaneous),
        [activities, type]
    );

    if (filtered.length === 0) {
        return (
            <View style={{ paddingHorizontal: 24, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#9EB294' : '#9CA3AF', letterSpacing: 0.5 }}>
                    No {type} activities
                </Text>
            </View>
        );
    }

    return (
        <View>
            <View style={{ paddingHorizontal: 24, paddingBottom: 8, paddingTop: 4 }}>
                <View style={{
                    alignSelf: 'flex-start',
                    backgroundColor: badge.bg,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: badge.text, letterSpacing: 1.5 }}>
                        {badge.label}
                    </Text>
                </View>
            </View>
            {filtered.map(activity => (
                <ActivityListItem
                    key={activity.id}
                    activity={activity}
                    onPress={onPress}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleComplete={onToggleComplete ? () => onToggleComplete(activity.id) : undefined}
                />
            ))}
        </View>
    );
});
