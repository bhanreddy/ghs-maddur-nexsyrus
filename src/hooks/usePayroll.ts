import { useState, useCallback } from 'react';
import { PayrollService, PayrollActionResult } from '../services/payrollService';
import { PayrollEntry } from '../types/payroll';

export function usePayroll(options?: { isAdmin?: boolean }) {
    const [loading, setLoading] = useState(false);
    const [payrollData, setPayrollData] = useState<PayrollEntry[]>([]);
    const [summary, setSummary] = useState({ total_paid: 0, total_pending: 0 });
    const [distributionBlocked, setDistributionBlocked] = useState(false);
    const [accountsDistributionBlocked, setAccountsDistributionBlocked] = useState(false);
    const [distributionLoading, setDistributionLoading] = useState(false);

    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const recomputeSummary = useCallback((data: PayrollEntry[]) => {
        const paid = data.filter(p => p.status === 'paid').reduce((sum, p) => sum + (Number(p.net_salary) || 0), 0);
        const pending = data.filter(p => p.status === 'pending').reduce((sum, p) => sum + (Number(p.net_salary) || 0), 0);
        setSummary({ total_paid: paid, total_pending: pending });
    }, []);

    const fetchDistributionStatus = useCallback(async () => {
        setDistributionLoading(true);
        try {
            if (options?.isAdmin) {
                const blocked = await PayrollService.getAdminDistributionStatus();
                setDistributionBlocked(blocked);
                setAccountsDistributionBlocked(blocked);
            } else {
                const status = await PayrollService.getDistributionStatus();
                setDistributionBlocked(status.blocked);
                setAccountsDistributionBlocked(status.accounts_blocked);
            }
        } finally {
            setDistributionLoading(false);
        }
    }, [options?.isAdmin]);

    const fetchPayroll = useCallback(async (month: number = selectedMonth, year: number = selectedYear) => {
        setLoading(true);
        const [data] = await Promise.all([
            PayrollService.getPayrollForMonth(month, year),
            fetchDistributionStatus(),
        ]);
        setPayrollData(data);
        recomputeSummary(data);
        setLoading(false);
    }, [selectedMonth, selectedYear, fetchDistributionStatus, recomputeSummary]);

    const markAsPaid = async (id: string): Promise<PayrollActionResult> => {
        const result = await PayrollService.markAsPaid(id);
        if (result.ok) {
            setPayrollData(prev => {
                const next = prev.map(item =>
                    item.id === id
                        ? { ...item, status: 'paid' as const, payment_date: new Date().toISOString().split('T')[0] }
                        : item
                );
                recomputeSummary(next);
                return next;
            });
        }
        return result;
    };

    const adjustSalary = async (
        id: string,
        salary_adjustment: number,
        remarks?: string
    ): Promise<PayrollActionResult> => {
        const result = await PayrollService.adjustSalary(id, salary_adjustment, remarks);
        if (result.ok && 'payroll' in result && result.payroll) {
            const updated = result.payroll;
            setPayrollData(prev => {
                const next = prev.map(item => item.id === id ? { ...item, ...updated } : item);
                recomputeSummary(next);
                return next;
            });
        }
        return result;
    };

    const setDistributionBlockedForAccounts = async (blocked: boolean): Promise<PayrollActionResult> => {
        const result = await PayrollService.setAdminDistributionBlocked(blocked);
        if (result.ok) {
            setDistributionBlocked(blocked);
            setAccountsDistributionBlocked(blocked);
        }
        return result;
    };

    return {
        payrollData,
        loading,
        summary,
        selectedMonth,
        selectedYear,
        setSelectedMonth,
        setSelectedYear,
        fetchPayroll,
        markAsPaid,
        adjustSalary,
        distributionBlocked,
        accountsDistributionBlocked,
        distributionLoading,
        setDistributionBlockedForAccounts,
        fetchDistributionStatus,
    };
}
