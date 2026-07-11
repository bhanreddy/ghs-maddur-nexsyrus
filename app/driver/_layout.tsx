import React from 'react';
import { MaterialTopTabs } from '../../src/layouts/MaterialTopTabs';
import DriverFooter from '../../src/components/DriverFooter';
import { useRequireRole } from '../../src/hooks/useRequireRole';
export { ErrorBoundary } from '@/src/components/ErrorBoundary';

export default function DriverLayout() {
    // Ensure only drivers can access this segment
    useRequireRole('driver', 'admin');

    return (
        <MaterialTopTabs
            tabBarPosition="bottom"
            tabBar={(props) => <DriverFooter {...props} />}
            screenOptions={{
                swipeEnabled: true,
                animationEnabled: true,
                lazy: true,
                headerShown: false,
            } as any}
        >
            <MaterialTopTabs.Screen
                name="trip"
                options={{ title: "My Trip" }}
            />
            <MaterialTopTabs.Screen
                name="dashboard"
                options={{ title: "Route" }}
            />
            <MaterialTopTabs.Screen
                name="students"
                options={{ title: "Students" }}
            />
            <MaterialTopTabs.Screen
                name="bus-attendance"
                options={{ title: "Attendance" }}
            />
            <MaterialTopTabs.Screen
                name="payslip"
                options={{ title: "Payslips" }}
            />
            <MaterialTopTabs.Screen
                name="profile"
                options={{ title: "Profile" }}
            />
        </MaterialTopTabs>
    );
}
