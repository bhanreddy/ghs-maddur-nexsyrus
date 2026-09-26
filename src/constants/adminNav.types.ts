import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type AdminNavIconName = React.ComponentProps<typeof Ionicons>['name'];
export type AdminNavTier = 'PRIMARY' | 'FINANCE' | 'ACADEMIC' | 'OPS' | 'ADMIN';

/** Shared shape for an admin destination. Sidebar and Quick Action lists are separate. */
export interface AdminNavAction {
  title: string;
  icon: AdminNavIconName;
  route: string;
  tier: AdminNavTier;
  gradient: [string, string];
  category: string;
  /** RBAC permission required to see this entry (optional). */
  permission?: string;
}
