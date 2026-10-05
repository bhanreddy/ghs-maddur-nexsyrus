import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { alertCompat } from '../src/utils/crossPlatformAlert';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../src/hooks/useTheme';
import { ThemeColors } from '../src/theme/themes';
import { AuthService } from '../src/services/authService';
import { useAuth } from '../src/hooks/useAuth';
import { SCHOOL_ID } from '../src/constants/school';
import { disableFingerprintForAccount } from '../src/services/biometricService';
import AnimatedInput from '../src/components/AnimatedInput';
import PremiumButton from '../src/components/PremiumButton';

export default function ChangePasswordScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { user } = useAuth();
    const styles = React.useMemo(() => getStyles(theme.colors), [theme]);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const validate = () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            return "All fields are required.";
        }
        if (newPassword.length < 8) {
            return "New password must be at least 8 characters.";
        }
        if (!/[A-Z]/.test(newPassword)) {
            return "New password must contain at least one uppercase letter.";
        }
        if (!/[a-z]/.test(newPassword)) {
            return "New password must contain at least one lowercase letter.";
        }
        if (!/[0-9]/.test(newPassword)) {
            return "New password must contain at least one number.";
        }
        if (newPassword !== confirmPassword) {
            return "New password and Confirm password do not match.";
        }
        if (newPassword === currentPassword) {
            return "New password must be different from current password.";
        }
        return null;
    };

    const handleChangePassword = async () => {
        setErrorMsg(null);
        const validationError = validate();
        if (validationError) {
            setErrorMsg(validationError);
            return;
        }

        setLoading(true);
        try {
            await AuthService.changePassword(currentPassword, newPassword);
            // A credential change invalidates the fingerprint opt-in: the next
            // sign-in must be with the new password before it can be re-enabled.
            if (user?.userId) {
                await disableFingerprintForAccount(SCHOOL_ID, user.userId);
            }
            alertCompat("Success", "Password changed successfully. Your session remains active.", [
                {
                    text: 'OK', onPress: () => {
                        router.back();
                    }
                }
            ]);
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || "Failed to change password";
            setErrorMsg(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <TourTarget id="screen.change-password.overview" style={{ flex: 1 }}><KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Animated.View entering={FadeInUp.duration(500)} style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.textStrong} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Change Password</Text>
                <View style={{ width: 40 }} />
            </Animated.View>

            <TourTarget id="screen.change-password.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.infoCard}>
                    <View style={styles.infoIconContainer}>
                        <Ionicons name="shield-checkmark" size={24} color="#6366F1" />
                    </View>
                    <Text style={styles.instruction}>
                        Your new password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters.
                    </Text>
                </Animated.View>

                {errorMsg && (
                    <Animated.View entering={FadeInDown.duration(400)} style={styles.errorContainer}>
                        <Ionicons name="alert-circle" size={20} color={theme.colors.alertBgDanger} />
                        <Text style={[styles.errorText, { color: theme.colors.alertTextDanger }]}>{errorMsg}</Text>
                    </Animated.View>
                )}

                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.formContainer}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Current Password</Text>
                        <AnimatedInput
                            placeholder="Enter current password"
                            secureTextEntry={!showCurrent}
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            autoCapitalize="none"
                            error={!!errorMsg && errorMsg.toLowerCase().includes('current')}
                            icon={({ color }) => <Ionicons name="lock-closed-outline" size={22} color={color} style={{ marginRight: 10 }} />}
                            rightAccessory={
                                <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeIcon}>
                                    <Ionicons name={showCurrent ? "eye-off" : "eye"} size={22} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                            }
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>New Password</Text>
                        <AnimatedInput
                            placeholder="Enter new password"
                            secureTextEntry={!showNew}
                            value={newPassword}
                            onChangeText={setNewPassword}
                            autoCapitalize="none"
                            error={!!errorMsg && errorMsg.toLowerCase().includes('new password')}
                            icon={({ color }) => <Ionicons name="key-outline" size={22} color={color} style={{ marginRight: 10 }} />}
                            rightAccessory={
                                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeIcon}>
                                    <Ionicons name={showNew ? "eye-off" : "eye"} size={22} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                            }
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Confirm New Password</Text>
                        <AnimatedInput
                            placeholder="Confirm new password"
                            secureTextEntry={!showConfirm}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            autoCapitalize="none"
                            error={!!errorMsg && errorMsg.toLowerCase().includes('match')}
                            icon={({ color }) => <Ionicons name="checkmark-done-outline" size={22} color={color} style={{ marginRight: 10 }} />}
                            rightAccessory={
                                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeIcon}>
                                    <Ionicons name={showConfirm ? "eye-off" : "eye"} size={22} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                            }
                        />
                    </View>

                    <PremiumButton
                        title="Update Password"
                        onPress={handleChangePassword}
                        loading={loading}
                        disabled={loading}
                        colors={['#6366F1', '#4F46E5']}
                        style={styles.submitButton}
                        icon={<Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />}
                    />
                </Animated.View>
            </TourScrollView></TourTarget>
        </KeyboardAvoidingView></TourTarget>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 20,
        backgroundColor: colors.background,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        zIndex: 10,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textStrong,
        letterSpacing: 0.5,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 40,
    },
    infoCard: {
        flexDirection: 'row',
        backgroundColor: '#EEF2FF', // soft indigo bg
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: '#E0E7FF',
    },
    infoIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    instruction: {
        flex: 1,
        fontSize: 14,
        color: '#4338CA',
        lineHeight: 22,
        fontWeight: '500',
    },
    formContainer: {
        marginTop: 8,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textStrong,
        marginBottom: 10,
        marginLeft: 4,
        letterSpacing: 0.3,
    },
    eyeIcon: {
        padding: 8,
    },
    submitButton: {
        marginTop: 16,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
    },
    errorText: {
        marginLeft: 10,
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    }
});
