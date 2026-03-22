import { Stack } from 'expo-router';

export default function AuthLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen name="entry" />
            <Stack.Screen name="password" />
            <Stack.Screen name="register" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="complete-profile" />
        </Stack>
    );
}
