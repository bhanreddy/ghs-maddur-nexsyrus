import React from 'react';
import { Stack } from 'expo-router';
import { useRequireRole } from '../../src/hooks/useRequireRole';
export { ErrorBoundary } from '@/src/components/ErrorBoundary';

export default function AdminLayout() {
    useRequireRole('admin', 'principal');

    return (
            <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent'}, headerShown: false, animation: 'slide_from_right' }}>
                <Stack.Screen name="dashboard" />
                <Stack.Screen name="manage-staff" />
                <Stack.Screen name="addStaff" />
                <Stack.Screen name="staff-form" />
                <Stack.Screen name="manage-content" />
                <Stack.Screen name="academics" />
                <Stack.Screen name="notices" />
                <Stack.Screen name="complaints" />
                <Stack.Screen name="messages" />
                <Stack.Screen name="leaves" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="upi-settings" />
                <Stack.Screen name="academic-year-upgrade" />
                <Stack.Screen name="payroll" />
            </Stack>
    );
}
