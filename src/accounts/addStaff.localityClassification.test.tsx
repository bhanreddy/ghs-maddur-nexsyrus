import React from 'react';
import { Text, TextInput } from 'react-native';
import AddStaffScreen from '../../app/accounts/addStaff';
import { StaffService } from '@/src/services/staffService';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer');

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/src/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));

jest.mock('@/src/hooks/useTheme', () => ({
  useTheme: () => ({ theme: { colors: {} }, isDark: false }),
}));

jest.mock('@/src/contexts/AccountsWebChromeContext', () => ({
  useAccountsWebChrome: () => ({ shellActive: true }),
}));

jest.mock('@/src/services/staffService', () => ({
  StaffService: {
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/src/services/referenceDataService', () => ({
  ReferenceDataService: {
    getStaffDesignations: jest.fn().mockResolvedValue([{ id: 2, name: 'Teacher' }]),
  },
}));

jest.mock('@/src/utils/crossPlatformAlert', () => ({
  alertCompat: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

jest.mock('@/components/keyboard/KeyboardAwareScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});

const staffApi = StaffService as jest.Mocked<typeof StaffService>;

function textOf(tree: any) {
  return tree.root.findAllByType(Text).map((node: any) => (
    React.Children.toArray(node.props.children)
      .filter((child) => typeof child === 'string' || typeof child === 'number')
      .join('')
  )).join(' ');
}

function byTestId(tree: any, testID: string) {
  return tree.root.findAll((node: any) => node.props?.testID === testID)[0];
}

function option(tree: any, testID: string) {
  return byTestId(tree, testID);
}

function pressLabeled(tree: any, label: string) {
  const match = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && textOf({ root: node }).includes(label));
  return match[match.length - 1];
}

async function fill(tree: any, placeholder: string, value: string) {
  const input = tree.root.findAllByType(TextInput).find((node: any) => node.props.placeholder === placeholder);
  await act(async () => {
    input.props.onChangeText(value);
  });
}

async function renderStaffForm() {
  let tree: any;
  await act(async () => {
    tree = create(React.createElement(AddStaffScreen));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
}

describe('staff locality classification field', () => {
  beforeEach(() => {
    mockParams = {};
    jest.clearAllMocks();
    staffApi.create.mockResolvedValue({ id: 'new-staff' } as any);
    staffApi.update.mockResolvedValue({ id: 'staff-1' } as any);
    staffApi.getById.mockResolvedValue({
      id: 'staff-1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@school.edu',
      phone: '9876543210',
      designation_id: 2,
      designation: 'Teacher',
      staff_code: 'STF-1',
      joining_date: '2024-06-15',
      gender: 'Female',
      locality_classification: 'NON_LOCAL',
    } as any);
  });

  test('add mode renders an optional selector and sends null when it stays unspecified', async () => {
    const tree = await renderStaffForm();
    expect(textOf(tree)).toContain('Locality Classification');
    expect(textOf(tree)).toContain('Not specified');
    expect(textOf(tree)).toContain('Local');
    expect(textOf(tree)).toContain('Non Local');
    expect(option(tree, 'locality-option-unspecified').props.accessibilityState.selected).toBe(true);
    expect(textOf(tree)).not.toContain('Locality Classification *');

    await fill(tree, 'Jane', 'Ada');
    await fill(tree, 'Doe', 'Lovelace');
    await fill(tree, 'STF-001', 'STF-9');
    await fill(tree, 'staff@school.edu', 'ada@school.edu');
    await fill(tree, '+91 98765 43210', '9876543210');
    await fill(tree, 'Min 6 characters', 'secret1');

    const save = pressLabeled(tree, 'Add Staff Member');
    await act(async () => {
      await save.props.onPress();
    });

    expect(staffApi.create).toHaveBeenCalledWith(expect.objectContaining({
      locality_classification: null,
      first_name: 'Ada',
      staff_code: 'STF-9',
    }));
    expect(staffApi.update).not.toHaveBeenCalled();
  });

  test('add mode includes LOCAL in the create payload', async () => {
    const tree = await renderStaffForm();
    await act(async () => {
      option(tree, 'locality-option-LOCAL').props.onPress();
    });
    expect(option(tree, 'locality-option-LOCAL').props.accessibilityState.selected).toBe(true);

    await fill(tree, 'Jane', 'Ada');
    await fill(tree, 'Doe', 'Lovelace');
    await fill(tree, 'STF-001', 'STF-8');
    await fill(tree, 'staff@school.edu', 'ada@school.edu');
    await fill(tree, '+91 98765 43210', '9876543210');
    await fill(tree, 'Min 6 characters', 'secret1');

    const save = pressLabeled(tree, 'Add Staff Member');
    await act(async () => {
      await save.props.onPress();
    });

    expect(staffApi.create).toHaveBeenCalledWith(expect.objectContaining({
      locality_classification: 'LOCAL',
    }));
  });

  test('edit mode hydrates the current classification and sends the selected value', async () => {
    mockParams = { id: 'staff-1' };
    const tree = await renderStaffForm();
    expect(textOf(tree)).toContain('Locality Classification');
    expect(option(tree, 'locality-option-NON_LOCAL').props.accessibilityState.selected).toBe(true);
    expect(staffApi.getById).toHaveBeenCalledWith('staff-1');

    await act(async () => {
      option(tree, 'locality-option-LOCAL').props.onPress();
    });
    const save = pressLabeled(tree, 'Save Changes');
    await act(async () => {
      await save.props.onPress();
    });

    expect(staffApi.update).toHaveBeenCalledWith('staff-1', expect.objectContaining({
      locality_classification: 'LOCAL',
      staff_code: 'STF-1',
      email: 'ada@school.edu',
    }));
    expect(staffApi.create).not.toHaveBeenCalled();
  });

  test('edit mode can clear the classification without making it required', async () => {
    mockParams = { id: 'staff-1' };
    staffApi.getById.mockResolvedValueOnce({
      id: 'staff-1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@school.edu',
      phone: '9876543210',
      designation_id: 2,
      designation: 'Teacher',
      staff_code: 'STF-1',
      joining_date: '2024-06-15',
      gender: 'Female',
      locality_classification: null,
    } as any);
    const tree = await renderStaffForm();
    expect(option(tree, 'locality-option-unspecified').props.accessibilityState.selected).toBe(true);

    const save = pressLabeled(tree, 'Save Changes');
    await act(async () => {
      await save.props.onPress();
    });

    expect(staffApi.update).toHaveBeenCalledWith('staff-1', expect.objectContaining({
      locality_classification: null,
    }));
  });
});
