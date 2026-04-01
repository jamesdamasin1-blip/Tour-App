import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface ActivityFormDetailsProps {
    title: string;
    setTitle: (text: string) => void;
    category: string;
    setCategory: (cat: string) => void;
    description: string;
    setDescription: (text: string) => void;
    isDark: boolean;
    isAdmin: boolean;
    errors: Record<string, string>;
    setErrors: (errors: any) => void;
}

export const ActivityFormDetails: React.FC<ActivityFormDetailsProps> = ({
    title, setTitle,
    category, setCategory,
    description, setDescription,
    isDark, isAdmin,
    errors, setErrors
}) => {
    return (
        <View className="px-4 pt-4 pb-2">
            <Text className={`text-xs font-bold mb-3 uppercase tracking-widest opacity-60 ${isDark ? 'text-[#B2C4AA]' : 'text-[#5D6D54]'}`}>Activity Details</Text>

            <Text className={`text-[10px] font-black mb-1 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>TITLE</Text>
            <View 
                className="flex-row items-center border rounded-2xl px-4 py-3.5"
                style={{ 
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', 
                    borderColor: errors.title ? '#FF3B30' : (isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)'),
                    marginBottom: 16 
                }}
            >
                <Feather name="map" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} />
                <TextInput
                    placeholder="e.g. Eiffel Tower Visit"
                    placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.5)" : "#9ca3af"}
                    value={title}
                    editable={isAdmin}
                    onChangeText={(text) => {
                        setTitle(text);
                        if (errors.title) setErrors((prev: any) => ({ ...prev, title: '' }));
                    }}
                    className={`flex-1 text-base ml-3 font-semibold ${isDark ? 'text-white' : 'text-gray-900'} ${errors.title ? 'text-red-500' : ''} ${!isAdmin ? 'opacity-70' : ''}`}
                />
            </View>
            {errors.title && <Text className="text-red-500 text-[10px] font-bold mt-[-16px] mb-4 ml-4 uppercase">{errors.title}</Text>}

            <Text className={`text-[10px] font-black mb-1 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>CATEGORY</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
                {['Transport', 'Food', 'Hotel', 'Sightseeing', 'Other'].map((cat) => (
                    <TouchableOpacity
                        key={cat}
                        onPress={() => setCategory(cat)}
                        style={[
                            { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
                            category === cat
                                ? { backgroundColor: isDark ? '#B2C4AA' : '#5D6D54', borderColor: isDark ? '#B2C4AA' : '#5D6D54' }
                                : { 
                                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', 
                                    borderColor: isDark ? 'rgba(158, 178, 148, 0.3)' : 'rgba(93, 109, 84, 0.15)' 
                                  }
                        ]}
                    >
                        <Text style={[{ fontSize: 12, fontWeight: '700' }, category === cat ? { color: isDark ? '#1a1a1a' : 'white' } : { color: isDark ? '#B2C4AA' : '#5D6D54' }]}>
                            {cat}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text className={`text-[10px] font-black mb-1 uppercase tracking-widest ${isDark ? 'text-[#B2C4AA]' : 'text-gray-400'}`}>NOTES</Text>
            <View style={{ 
                flexDirection: 'row', 
                alignItems: 'flex-start', 
                borderWidth: 1, 
                borderColor: isDark ? 'rgba(158,178,148,0.20)' : 'rgba(93,109,84,0.15)', 
                borderRadius: 16, 
                paddingHorizontal: 16, 
                paddingVertical: 14, 
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(93, 109, 84, 0.05)', 
                marginBottom: 16 
            }}>
                <Feather name="align-left" size={18} color={isDark ? "#B2C4AA" : "#9EB294"} style={{ marginTop: 2 }} />
                <TextInput
                     placeholder="Add notes for this activity..."
                     placeholderTextColor={isDark ? "rgba(242, 240, 232, 0.5)" : "#9ca3af"}
                    multiline
                    numberOfLines={4}
                    value={description}
                    onChangeText={setDescription}
                    className={`flex-1 text-base ml-3 font-semibold min-h-[80px] ${isDark ? 'text-white' : 'text-gray-900'}`}
                    textAlignVertical="top"
                />
            </View>
        </View>
    );
};
