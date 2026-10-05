import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import PayrollScreen from '../../src/components/payroll/PayrollScreen';

export default function AdminPayroll() {
  return <TourTarget id="screen.admin-payroll.overview" style={{ flex: 1 }}><TourTarget id="screen.admin-payroll.workspace" style={{ flex: 1 }}><PayrollScreen isAdmin title="Payroll" /></TourTarget></TourTarget>;
}
