import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Layout from '../components/Layout';
import { UserRole, type User } from '../types';

vi.mock('../components/FloatingAIChat', () => ({
  default: () => <div>Floating AI</div>,
}));

vi.mock('../services/syncService', () => ({
  getCloudConfig: () => ({
    enabled: false,
    storeId: '',
    url: '',
    token: '',
    openRouterApiKey: '',
    aiModel: 'openrouter/auto',
  }),
}));

const kasirUser: User = {
  id: 'U2',
  name: 'Kasir Utama',
  username: 'kasir',
  passwordHash: '',
  role: UserRole.KASIR,
  permissions: ['dashboard.view', 'sale.create', 'sale.view', 'return.create'],
  schedule: { enabled: true, startTime: '08:00', endTime: '17:00' },
  isActive: true,
};

describe('Layout for kasir', () => {
  it('shows cashier navigation and hides admin menus', () => {
    render(
      <Layout
        activeTab="dashboard"
        setActiveTab={() => {}}
        currentUser={kasirUser}
        onLogout={() => {}}
        items={[]}
        sales={[]}
        accounts={[]}
        floatingMessages={[]}
        onUpdateMessages={() => {}}
        isSyncing={false}
        onManualSync={() => {}}
        syncError={false}
      >
        <div>Dashboard Body</div>
      </Layout>,
    );

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getByText('Kasir')).toBeInTheDocument();
    expect(screen.getByText('Penjualan')).toBeInTheDocument();
    expect(screen.getByText('Retur')).toBeInTheDocument();
    expect(screen.queryByText('Pengaturan')).not.toBeInTheDocument();
    expect(screen.queryByText('User')).not.toBeInTheDocument();
    expect(screen.queryByText('Pembelian')).not.toBeInTheDocument();
  });
});
