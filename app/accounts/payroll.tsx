import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { Redirect } from 'expo-router';
import PayrollScreen from '../../src/components/payroll/PayrollScreen';
import { usePermissions } from '../../src/hooks/usePermissions';

export default function AccountsPayroll() {
  const { hasPermission } = usePermissions();
  // Payroll/payslips are management-only (RBAC epic #3). Cosmetic guard against
  // direct navigation — the server already 403s these routes for accounts.
  if (!hasPermission('payroll.process')) {
    return <Redirect href="/accounts/dashboard" />;
  }
  return <TourTarget id="screen.accounts-payroll.overview" style={{ flex: 1 }}><TourTarget id="screen.accounts-payroll.workspace" style={{ flex: 1 }}><PayrollScreen title="Payroll" /></TourTarget></TourTarget>;
}
