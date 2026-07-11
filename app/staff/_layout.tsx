import React from 'react';
import type { MaterialTopTabNavigationOptions } from '@react-navigation/material-top-tabs';
import { MaterialTopTabs } from '../../src/layouts/MaterialTopTabs';
import StaffFooter from '../../src/components/StaffFooter';
import { useRequireRole } from '../../src/hooks/useRequireRole';
export { ErrorBoundary } from '@/src/components/ErrorBoundary';

/** Tab options plus parent native-stack fields React Navigation merges upward (e.g. headerShown). */
type StaffTabScreenOptions = MaterialTopTabNavigationOptions & {
    headerShown?: boolean;
};

const dashboardScreenOptions: StaffTabScreenOptions = {
    title: 'Home',
    headerShown: false,
};

export default function StaffLayout() {
    useRequireRole('staff', 'teacher', 'admin');

    /** Screens that appear in the bottom bar and can be swiped between. */
    const SWIPEABLE_TABS = ['dashboard', 'manage-students', 'timetable', 'results'];

    /** Common options for screens that should NOT be part of the swipe pager. */
    const hiddenScreenOptions: StaffTabScreenOptions = {
        swipeEnabled: false,
        lazy: true,
        // These screens render their own StaffHeader, so the tab navigator must
        // not draw its default header (it showed the raw route name, e.g. "profile").
        headerShown: false,
    };

    return (
        <MaterialTopTabs
            tabBarPosition="bottom"
            tabBar={(props) => <StaffFooter {...props} />}
            screenOptions={({ route }) => ({
                swipeEnabled: SWIPEABLE_TABS.includes(route.name),
                animationEnabled: true,
                lazy: true,
            })}
        >
            {/* ── Bottom-bar tabs (swipeable) ── */}
            <MaterialTopTabs.Screen
                name="dashboard"
                options={dashboardScreenOptions}
            />
            <MaterialTopTabs.Screen
                name="manage-students"
                options={{ title: "Attendance", headerShown: false } as any}
            />
            <MaterialTopTabs.Screen
                name="timetable"
                options={{ title: "Timetable", headerShown: false } as any}
            />
            <MaterialTopTabs.Screen
                name="results"
                options={{ title: "Results", headerShown: false } as any}
            />

            {/* ── Non-tab screens (navigable but NOT swipeable) ── */}
            <MaterialTopTabs.Screen name="attendance" options={{ ...hiddenScreenOptions, title: 'Attendance', headerShown: false } as any} />
            <MaterialTopTabs.Screen name="complaints" options={{ ...hiddenScreenOptions, headerShown: false } as any} />
            <MaterialTopTabs.Screen name="messages" options={{ ...hiddenScreenOptions, headerShown: false } as any} />
            <MaterialTopTabs.Screen name="diary" options={{ ...hiddenScreenOptions, headerShown: false } as any} />
            <MaterialTopTabs.Screen name="leaves" options={{ ...hiddenScreenOptions, headerShown: false } as any} />
            <MaterialTopTabs.Screen name="lms-upload" options={hiddenScreenOptions} />
            <MaterialTopTabs.Screen name="notices" options={{ ...hiddenScreenOptions, headerShown: false } as any} />
            <MaterialTopTabs.Screen name="payslip" options={hiddenScreenOptions} />
            <MaterialTopTabs.Screen name="profile" options={hiddenScreenOptions} />
            <MaterialTopTabs.Screen name="settings" options={hiddenScreenOptions} />
            <MaterialTopTabs.Screen name="student-details" options={hiddenScreenOptions} />
        </MaterialTopTabs>
    );
}