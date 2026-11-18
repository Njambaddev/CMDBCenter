import React, { useEffect, useState } from 'react';
import { Layout, Menu, Button, Tag, Space, Dropdown, Tooltip, Typography, message, Modal } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  CustomerServiceOutlined,
  BarChartOutlined,
  AuditOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  SwapOutlined,
  SafetyCertificateOutlined,
  ExperimentOutlined,
  ApiOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BRAND, pageTitle } from '../../config/brand';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'Overview' },
  { key: '/cmdb', icon: <DatabaseOutlined />, label: 'CMDB Inventory' },
  { key: '/relationships', icon: <DeploymentUnitOutlined />, label: 'CI Relationships' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'Reports & Analytics' },
  { key: '/audit-logs', icon: <AuditOutlined />, label: 'Audit Logs' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, system, switchMode, logout } = useAuth();

  const selectedKey =
    NAV_ITEMS.find((n) => n.key !== '/' && location.pathname.startsWith(n.key))?.key || '/';
  const sectionLabel = NAV_ITEMS.find((i) => i.key === selectedKey)?.label;

  useEffect(() => {
    document.title = pageTitle(sectionLabel);
  }, [sectionLabel]);

  const handleToggleMode = async () => {
    const targetMode = user?.mode === 'live' ? 'demo' : 'live';
    setSwitching(true);
    try {
      await switchMode(targetMode);
      message.success(
        targetMode === 'live'
          ? 'Switched to Live Znuny GenericInterface API Mode'
          : 'Switched to Interactive Demo Sandbox Mode'
      );
    } catch (err) {
      if (err.code === 'ZNUNY_LOGIN_REQUIRED') {
        Modal.confirm({
          title: 'Znuny Agent Sign-In Required for Live API Mode',
          content:
            'Your current session was started in Demo Mode without Live Znuny Agent credentials. Would you like to sign in with your Znuny Agent account now?',
          okText: 'Sign In to Live Znuny',
          cancelText: 'Stay in Demo Mode',
          onOk: async () => {
            await logout();
            navigate('/login');
          },
        });
      } else {
        message.error(err.message);
      }
    } finally {
      setSwitching(false);
    }
  };

  const userMenuItems = [
    {
      key: 'role',
      disabled: true,
      label: (
        <div style={{ padding: '2px 0' }}>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{user?.fullName}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            @{user?.username} &bull; Role: {String(user?.role || '').toUpperCase()}
          </div>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'API & Safety Settings',
      onClick: () => navigate('/settings'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      danger: true,
      label: 'Sign Out',
      onClick: async () => {
        await logout();
        navigate('/login');
      },
    },
  ];

  const isLive = user?.mode === 'live';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={248}
        breakpoint="lg"
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          left: 0,
          overflow: 'auto',
          borderRight: '1px solid #1e293b',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: collapsed ? '0 20px' : '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            }}
          >
            {BRAND.logoLetter}
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
                {BRAND.name}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 11.5 }}>{BRAND.organisation} &bull; {BRAND.tagline}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 0' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={NAV_ITEMS}
            onClick={({ key }) => navigate(key)}
          />
        </div>

        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 14,
              right: 14,
              padding: '12px',
              borderRadius: 8,
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
              Backend Source of Truth
            </div>
            <div style={{ color: '#e2e8f0', fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>
              Znuny 6.5.1 GenericInterface
            </div>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {isLive ? 'mysupportstaging.atlancis.com' : 'Interactive Demo Sandbox'}
            </div>
          </div>
        )}
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 24px',
            height: 64,
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <Space size={12}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <Text strong style={{ fontSize: 15, color: '#0f172a' }}>
              {sectionLabel || BRAND.name}
            </Text>
          </Space>

          <Space size={10} wrap>
            {/* Clear Visual Mode Indicator */}
            <Tooltip
              title={
                isLive
                  ? 'Consuming real Znuny GenericInterface REST APIs on https://mysupportstaging.atlancis.com/'
                  : 'Operating against in-memory Atlancis Demo Store (safe sandbox for full CRUD testing)'
              }
            >
              <Tag
                icon={isLive ? <ApiOutlined /> : <ExperimentOutlined />}
                color={isLive ? 'blue' : 'purple'}
                style={{ padding: '4px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, margin: 0 }}
              >
                {isLive ? 'LIVE ZNUNY API' : 'DEMO SANDBOX MODE'}
              </Tag>
            </Tooltip>

            {/* Live-Write Safety Indicator */}
            {isLive && (
              <Tooltip
                title={
                  system?.allowLiveWrites
                    ? 'Live writes to Znuny CMDB & Tickets are enabled'
                    : 'Live Write Protection is ON: live reads are active, mutations are blocked until enabled in Settings'
                }
              >
                <Tag
                  icon={system?.allowLiveWrites ? <SafetyCertificateOutlined /> : <LockOutlined />}
                  color={system?.allowLiveWrites ? 'success' : 'warning'}
                  style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 6, margin: 0, cursor: 'pointer' }}
                  onClick={() => navigate('/settings')}
                >
                  {system?.allowLiveWrites ? 'Live Writes Enabled' : 'Write Guard Active'}
                </Tag>
              </Tooltip>
            )}

            {system?.demoEnabled && (
              <Button
                size="small"
                icon={<SwapOutlined />}
                loading={switching}
                onClick={handleToggleMode}
              >
                Switch to {isLive ? 'Demo' : 'Live'}
              </Button>
            )}

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button style={{ borderRadius: 8, height: 36 }}>
                <Space size={6}>
                  <UserOutlined style={{ color: '#2563eb' }} />
                  <span style={{ fontWeight: 600 }}>{user?.username}</span>
                  <Tag
                    color={user?.role === 'admin' ? 'geekblue' : user?.role === 'operator' ? 'cyan' : 'default'}
                    style={{ margin: 0, fontSize: 10.5, lineHeight: '16px' }}
                  >
                    {String(user?.role || '').toUpperCase()}
                  </Tag>
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: '22px 26px', maxWidth: 1680, width: '100%', margin: '0 auto' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
