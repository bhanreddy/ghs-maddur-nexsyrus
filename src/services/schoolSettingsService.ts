import { Platform } from 'react-native';
import { api } from './apiClient';
import type { ResultRankingMethod } from '../utils/assessmentGrading';

export interface SchoolSettings {
    school_name: string;
    school_address: string;
    school_phone: string;
    school_email: string;
    school_website: string;
    school_logo_url: string;
    school_tagline: string;
    school_affiliation: string;
    school_principal: string;
    principal_signature_url?: string;
    /** Optional — e.g. "D.E.O. Vikarabad" for bonafide recognition line */
    school_recognition?: string;
    /** Optional — e.g. "E" / "T" / "English" / "Telugu" for (E/M) / (T/M) suffix */
    school_medium?: string;
    /** Optional — e.g. "State" / "CBSE" */
    school_board?: string;
    /** Admin-selected policy applied to class result ranks. */
    result_ranking_method?: ResultRankingMethod;
}

export const SchoolSettingsService = {
    /**
     * Get school settings (name, address, phone, etc.)
     */
    getSettings: async (): Promise<SchoolSettings> => {
        return api.get<SchoolSettings>('/school-settings');
    },

    updateSettings: async (updates: Partial<SchoolSettings>): Promise<SchoolSettings> => {
        const response = await api.put<{ settings: SchoolSettings }>('/school-settings', updates);
        return response.settings;
    },

    uploadPrincipalSignature: async (uri: string, mimeType?: string | null): Promise<string> => {
        const formData = new FormData();
        if (Platform.OS === 'web') {
            const response = await fetch(uri);
            const blob = await response.blob();
            formData.append('signature', blob, 'principal-signature.jpg');
        } else {
            formData.append('signature', {
                uri,
                name: 'principal-signature.jpg',
                type: mimeType || 'image/jpeg',
            } as any);
        }
        const result = await api.uploadFormData<{ principal_signature_url: string }>(
            '/school-settings/principal-signature',
            formData,
            { method: 'PATCH', timeoutMs: 60000 },
        );
        return result.principal_signature_url;
    },

    removePrincipalSignature: async (): Promise<void> => {
        await api.delete('/school-settings/principal-signature');
    },
};
