import { supabase } from './supabaseConfig';
import { api } from './apiClient';

export interface AccessRequest {
    id: string;
    requested_by: string;
    department: string;
    request_note: string | null;
    status: 'pending' | 'approved' | 'denied';
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    user?: {
        display_name: string;
        email?: string;
    };
}

export interface AccountantOverride {
    user_id: string;
    display_name: string;
    email: string | null;
    enabled: boolean;
    granted_at: string | null;
    granted_by: string | null;
    granted_by_name: string | null;
}

export const AccessControlService = {
    checkTempAccess: async (department: string): Promise<boolean> => {
        // Check if there is an active grant that hasn't expired
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return false;

        const { data, error } = await supabase
            .from('temp_access_grants')
            .select('id')
            .eq('requested_by', session.session.user.id)
            .eq('department', department)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .limit(1);

        if (error) {
            console.error('Error checking temp access:', error);
            return false;
        }

        return data && data.length > 0;
    },

    requestOutOfHoursAccess: async (userId: string, department: string, note: string): Promise<void> => {
        try {
            await api.post('/auth/request-access', {
                userId,
                department,
                note
            });
        } catch (error) {
            console.error('Error submitting access request via API:', error);
            throw error;
        }
    },

    getPendingRequests: async (): Promise<AccessRequest[]> => {
        // 1. Get the pending requests
        const { data: requests, error } = await supabase
            .from('access_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching access requests:', error);
            throw error;
        }

        if (!requests || requests.length === 0) return [];

        // 2. Fetch user details — display_name is on persons, not users
        const userIds = requests.map(r => r.requested_by);
        const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, person_id, persons!inner(display_name)')
            .in('id', userIds);

        const userMap: Record<string, any> = {};
        if (!usersError && usersData) {
            usersData.forEach((u: any) => {
                userMap[u.id] = {
                    id: u.id,
                    display_name: u.persons?.display_name || 'Unknown User',
                };
            });
        }

        // 3. Map the data
        return requests.map(r => ({
            ...r,
            user: userMap[r.requested_by] || { display_name: 'Unknown User' }
        }));
    },

    getRequestHistory: async (): Promise<AccessRequest[]> => {
        // 1. Get the history requests (approved or denied)
        const { data: requests, error } = await supabase
            .from('access_requests')
            .select('*')
            .in('status', ['approved', 'denied'])
            .order('reviewed_at', { ascending: false, nullsFirst: false });

        if (error) {
            console.error('Error fetching access requests history:', error);
            throw error;
        }

        if (!requests || requests.length === 0) return [];

        // 2. Fetch user details
        const userIds = requests.map(r => r.requested_by);
        const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, person_id, persons!inner(display_name)')
            .in('id', userIds);

        const userMap: Record<string, any> = {};
        if (!usersError && usersData) {
            usersData.forEach((u: any) => {
                userMap[u.id] = {
                    id: u.id,
                    display_name: u.persons?.display_name || 'Unknown User',
                };
            });
        }

        // 3. Map the data
        return requests.map(r => ({
            ...r,
            user: userMap[r.requested_by] || { display_name: 'Unknown User' }
        }));
    },

    grantAccess: async (adminId: string, requestId: string): Promise<AccessRequest | null> => {
        // 1. Get the request
        const { data: request, error: reqError } = await supabase
            .from('access_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (reqError || !request) {
            console.error('Request not found or error fetching:', reqError);
            throw reqError || new Error('Request not found');
        }

        // 2. Insert grant
        const now = new Date();
        // Midnight tonight (end of day)
        const expiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

        const { error: grantError } = await supabase
            .from('temp_access_grants')
            .insert({
                school_id: request.school_id,
                department: request.department,
                granted_by: adminId,
                requested_by: request.requested_by,
                expires_at: expiresAt,
                is_active: true
            });

        if (grantError) throw grantError;

        // 3. Update request status
        const { data: updatedRequest, error: updateError } = await supabase
            .from('access_requests')
            .update({
                status: 'approved',
                reviewed_by: adminId,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', requestId)
            .select('*')
            .single();

        if (updateError) throw updateError;

        try {
            await api.post('/admin/notifications/access-response', {
                user_id: request.requested_by,
                status: 'approved'
            });
        } catch (e) {
            console.warn('Failed to send grant notification:', e);
        }

        return updatedRequest;
    },

    denyRequest: async (adminId: string, requestId: string): Promise<AccessRequest | null> => {
        const { data: updatedRequest, error } = await supabase
            .from('access_requests')
            .update({
                status: 'denied',
                reviewed_by: adminId,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', requestId)
            .select('*')
            .single();

        if (error) throw error;

        try {
            await api.post('/admin/notifications/access-response', {
                user_id: updatedRequest.requested_by, // using updatedRequest because we need the ID, wait, it has requested_by
                status: 'denied'
            });
        } catch (e) {
            console.warn('Failed to send deny notification:', e);
        }

        return updatedRequest;
    },

    // ── Standing "Always allow access" override ────────────────────────────
    // Persistent per-accountant bypass of the after-hours/weekend gate.
    // Distinct from the one-time grantAccess/temp_access_grants flow above.
    // Server enforces admin-only + same-school + accounts-role; never trust the
    // client. School scope is derived server-side from the JWT.

    // apiClient already unwraps the { success, school_id, data } envelope,
    // so these receive the inner payload directly.
    getAccountants: async (): Promise<AccountantOverride[]> => {
        const res = await api.get<{ accountants: AccountantOverride[] }>('/admin/account-access');
        return res?.accountants ?? [];
    },

    setStandingAccess: async (
        userId: string,
        enabled: boolean
    ): Promise<{ user_id: string; enabled: boolean; granted_at: string | null; message: string }> => {
        return api.patch(`/admin/account-access/${userId}`, { enabled });
    },
};
