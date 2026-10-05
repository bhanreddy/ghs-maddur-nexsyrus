import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import { useInvoices } from '../../src/hooks/useInvoices';
import { generateInvoicePDF } from '../../src/utils/pdfGenerator';
import { Invoice } from '../../src/types/invoices';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
export default function AccountsInvoices() {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { shellActive } = useAccountsWebChrome();
  const {
    invoices,
    loading,
    error,
    hasMore,
    loadMore,
    refresh
  } = useInvoices();
  const handleDownload = async (invoice: Invoice) => {
    try {
      await generateInvoicePDF(invoice);
    } catch (err) {
      alertCompat('Error', 'Failed to generate PDF. Please try again.');
    }
  };
  const renderItem = ({
    item
  }: {
    item: Invoice;
  }) => {
    // Derived Invoice Number
    const invoiceNo = `INV-${new Date(item.created_at).getFullYear()}-${item.id.slice(0, 5).toUpperCase()}`;
    const studentName = item.student?.person?.display_name || 'Student';
    const feeName = item.fee_structure?.fee_type?.name || 'Fee';
    return <View style={styles.card}>
      <View style={styles.iconBox}>
        <Ionicons name="document-text" size={24} color="#6366F1" />
      </View>

      <View style={styles.info}>
        <Text style={styles.invoiceNo}>{invoiceNo}</Text>
        <Text style={styles.name}>{studentName}</Text>
        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleDateString('en-GB')} • {feeName}
        </Text>
      </View>

      <View style={styles.amountBox}>
        <Text style={styles.amount}>₹{item.amount_due.toLocaleString('en-IN')}</Text>
        <TouchableOpacity onPress={() => handleDownload(item)} style={styles.downloadBtn}>
          <MaterialIcons name="file-download" size={22} color="#4F46E5" />
        </TouchableOpacity>
      </View>
    </View>;
  };
  const renderFooter = () => {
    if (!loading) return null;
    return <LogoLoader style={{
      margin: 20
    }} color="#4F46E5" />;
  };
  return <TourTarget id="screen.accounts-invoices.overview" native><View style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#fff" />
    {!shellActive && <AdminHeader title="Invoices" showBackButton={true} />}

    {error && <View style={styles.errorBox}>
      <Text style={styles.errorText}>Error loading invoices: {error}</Text>
    </View>}

    <TourTarget id="screen.accounts-invoices.workspace" native><FlatList data={invoices} keyExtractor={item => item.id} renderItem={renderItem} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} onEndReached={hasMore ? loadMore : null} onEndReachedThreshold={0.5} ListFooterComponent={renderFooter} ListEmptyComponent={!loading ? <View style={styles.centered}>
      <Text style={styles.emptyText}>No invoices found</Text>
    </View> : null} refreshing={loading && invoices.length === 0} onRefresh={refresh} /></TourTarget>
  </View></TourTarget>;
}
const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50
  },
  listContent: {
    padding: 20
  },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: theme.colors.text,
    shadowOffset: {
      width: 0,
      height: 1
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1
  },
  iconBox: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  info: {
    flex: 1
  },
  invoiceNo: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937'
  },
  date: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2
  },
  amountBox: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 45
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827'
  },
  downloadBtn: {
    padding: 4
  },
  emptyText: {
    color: theme.colors.textTertiary,
    fontSize: 16
  },
  errorBox: {
    padding: 10,
    backgroundColor: '#FECACA',
    margin: 20,
    borderRadius: 8
  },
  errorText: {
    color: '#991B1B'
  }
});