import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { Redirect } from 'expo-router';
import CertificateGenerator from '../admin/certificate-generator';
import { usePermissions } from '../../src/hooks/usePermissions';

export default function AccountsCertificateGenerator() {
  const { hasPermission } = usePermissions();

  if (!hasPermission('certificates.issue')) {
    return <Redirect href="/accounts/dashboard" />;
  }

  return <TourTarget id="screen.accounts-certificate-generator.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-certificate-generator.workspace" style={{ flex: 1 }}><CertificateGenerator /></TourTarget></TourTarget>;
}
