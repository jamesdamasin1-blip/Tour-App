import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Activity } from '@/src/types/models';
import { useStore } from '@/src/store/useStore';
import { ActivityListItem } from '@/components/ActivityListItem';

interface Props {
    activities: Activity[];
    tripTitle?: string;
    onPress?: (activity: Activity) => void;
    onEdit?: (activity: Activity) => void;
    onDelete?: (activity: Activity) => void;
    onToggleComplete?: (activityId: string) => void;
}

type ViewMode = 'planned' | 'spontaneous';

export const ActivitiesSection = React.memo(({
    activities, tripTitle, onPress, onEdit, onDelete, onToggleComplete,
}: Props) => {
    const { theme } = useStore();
    const isDark = theme === 'dark';
    const [mode, setMode] = useState<ViewMode>('planned');

    const filtered = useMemo(
        () => activities
            .filter(a => mode === 'planned' ? !a.isSpontaneous : !!a.isSpontaneous)
            .sort((a, b) => (a.isCompleted ? 1 : 0) - (b.isCompleted ? 1 : 0)),
        [activities, mode]
    );

    if (activities.length === 0) {
        return (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 60 }}>
                <View style={{
                    padding: 24, borderRadius: 999, marginBottom: 20,
                    backgroundColor: isDark ? 'rgba(158, 178, 148, 0.1)' : 'rgba(158, 178, 148, 0.15)',
                }}>
                    <Feather name="plus" size={48} color={isDark ? '#B2C4AA' : '#9EB294'} />
                </View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: isDark ? '#F2F0E8' : '#111827', textAlign: 'center', marginBottom: 8 }}>
                    Add Activity
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#9EB294' : '#6B7280', textAlign: 'center', lineHeight: 20 }}>
                    Tap the button below to add your first activity{tripTitle ? ` for ${tripTitle}` : ''}!
                </Text>
            </View>
        );
    }

    return (
        <View>
            {/* Static header */}
            <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '900', color: isDark ? '#9EB294' : '#6B7280', letterSpacing: 2, textTransform: 'uppercase' }}>
                    ACTIVITIES
                </Text>
            </View>

            {/* Toggle */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <View style={{
                    flexDirection: 'row', padding: 4, borderRadius: 16,
                    backgroundColor: isDark ? 'rgba(40, 44, 38, 0.8)' : 'rgba(93, 109, 84, 0.1)',
                    borderWidth: 1, borderColor: isDark ? 'rgba(158,178,148,0.15)' : 'rgba(93,109,84,0.15)',
                }}>
                    {(['planned', 'spontaneous'] as ViewMode[]).map(tab => (
                        <TouchableOpacity
                            key={tab}
                            onPress={() => setMode(tab)}
                            style={{
                                flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                backgroundColor: mode === tab ? (isDark ? '#B2C4AA' : '#5D6D54') : 'transparent',
                            }}
                        >
                            <Text style={{
                                fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase',
                                color: mode === tab ? (isDark ? '#1A1C18' : 'white') : (isDark ? '#9EB294' : '#5D6D54'),
                            }}>
                                {tab === 'planned' ? 'PLANNED' : 'SPONTANEOUS'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Filtered list */}
            {filtered.length === 0 ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#9EB294' : '#9CA3AF', letterSpacing: 0.5 }}>
                        No {mode} activities
                    </Text>
                </View>
            ) : (
                filtered.map(activity => (
                    <ActivityListItem
                        key={activity.id}
                        activity={activity}
                        onPress={onPress}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onToggleComplete={onToggleComplete ? () => onToggleComplete(activity.id) : undefined}
                    />
                ))
            )}
        </View>
    );
});
