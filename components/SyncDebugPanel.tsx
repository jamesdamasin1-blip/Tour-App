import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
    clearSyncTraceEntries,
    getSyncTraceEntries,
    subscribeSyncTraceEntries,
    type SyncTraceEntry,
} from '@/src/sync/debug';

type SyncDebugPanelProps = {
    isDark: boolean;
    tripId?: string;
};

const formatTime = (ts: number): string => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

export const SyncDebugPanel = ({ isDark, tripId }: SyncDebugPanelProps) => {
    const [expanded, setExpanded] = useState(true);
    const [entries, setEntries] = useState<SyncTraceEntry[]>(() => getSyncTraceEntries());

    useEffect(() => subscribeSyncTraceEntries(setEntries), []);

    const filtered = useMemo(() => {
        const target = tripId?.trim();
        const relevant = target
            ? entries.filter(entry => entry.message.includes(target))
            : entries;
        return relevant.slice(-14).reverse();
    }, [entries, tripId]);

    return (
        <View style={{
            position: 'absolute',
            right: 12,
            left: 12,
            bottom: 82,
            zIndex: 30,
        }}>
            <View style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(158,178,148,0.22)' : 'rgba(93,109,84,0.18)',
                backgroundColor: isDark ? 'rgba(26,28,24,0.94)' : 'rgba(255,255,255,0.94)',
                overflow: 'hidden',
            }}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setExpanded(prev => !prev)}
                    style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <View>
                        <Text style={{
                            fontSize: 10,
                            fontWeight: '900',
                            letterSpacing: 1.4,
                            color: '#F59E0B',
                        }}>
                            SYNC TRACE
                        </Text>
                        <Text style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: isDark ? 'rgba(242,240,232,0.72)' : 'rgba(17,24,39,0.62)',
                            marginTop: 2,
                        }}>
                            {tripId ? `Trip ${tripId.slice(0, 8)} • ${filtered.length} entries` : `${filtered.length} entries`}
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                            onPress={clearSyncTraceEntries}
                            style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 8,
                                backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)',
                            }}
                        >
                            <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '900' }}>CLEAR</Text>
                        </TouchableOpacity>
                        <Text style={{
                            color: isDark ? '#B2C4AA' : '#5D6D54',
                            fontSize: 12,
                            fontWeight: '900',
                        }}>
                            {expanded ? 'HIDE' : 'SHOW'}
                        </Text>
                    </View>
                </TouchableOpacity>

                {expanded && (
                    <ScrollView
                        style={{ maxHeight: 220 }}
                        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
                    >
                        {filtered.length === 0 ? (
                            <Text style={{
                                fontSize: 11,
                                color: isDark ? 'rgba(242,240,232,0.65)' : 'rgba(17,24,39,0.6)',
                            }}>
                                No trace entries yet.
                            </Text>
                        ) : filtered.map(entry => (
                            <View
                                key={entry.id}
                                style={{
                                    paddingVertical: 7,
                                    borderTopWidth: 1,
                                    borderTopColor: isDark ? 'rgba(158,178,148,0.10)' : 'rgba(93,109,84,0.08)',
                                }}
                            >
                                <Text style={{
                                    fontSize: 10,
                                    fontWeight: '900',
                                    color: '#F59E0B',
                                    marginBottom: 2,
                                }}>
                                    {formatTime(entry.ts)} {entry.scope}.{entry.event}
                                </Text>
                                <Text style={{
                                    fontSize: 10,
                                    lineHeight: 14,
                                    color: isDark ? '#F2F0E8' : '#111827',
                                }}>
                                    {entry.message}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>
        </View>
    );
};
