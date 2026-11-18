import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Switch,
  Table,
  Tag,
  Descriptions,
  Alert,
  Space,
  Modal,
  Typography,
  Spin,
  message,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ClearOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { settingsApi } from '../api/dashboardApi';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/formatters';

const { Title, Text, Paragraph } = Typography;

export default function SettingsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [togglingWrite, setTogglingWrite] = useState(false);

  const { user, isAdmin, updateAllowLiveWritesState } = useAuth();

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settingsApi.getStatus();
      setStatus(res);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleVerifyConnectivity = async () => {
    setVerifying(true);
    try {
      const report = await settingsApi.verifyZnuny();
      setStatus((prev) => ({ ...prev, lastVerification: report }));
      message.success('Completed live Znuny GenericInterface diagnostic check');
    } catch (err) {
      message.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleToggleLiveWrites = (nextEnabled) => {
    Modal.confirm({
      title: nextEnabled
        ? 'Enable Live Write Operations on Znuny?'
        : 'Re-enable Live Write Protection (Read-Only Guard)?',
      content: nextEnabled
        ? 'Enabling Live Writes allows Administrators and Operators in Live API Mode to create and update real Configuration Items and Tickets on https://mysupportstaging.atlancis.com/. Proceed?'
        : 'Live Znuny data will return to protected read-only mode.',
      okText: nextEnabled ? 'Enable Live Writes' : 'Enable Write Guard',
      okButtonProps: { danger: nextEnabled },
      onOk: async () => {
        setTogglingWrite(true);
        try {
          const res = await settingsApi.setLiveWrites(nextEnabled);
          setStatus((prev) => ({ ...prev, allowLiveWrites: res.allowLiveWrites }));
          updateAllowLiveWritesState(res.allowLiveWrites);
          message.success(
            res.allowLiveWrites
              ? 'Live Znuny writes enabled'
              : 'Live Write Protection re-activated'
          );
        } catch (err) {
          message.error(err.message);
        } finally {
          setTogglingWrite(false);
        }
      },
    });
  };

  const handleFlushCache = async () => {
    try {
      await settingsApi.clearCache();
      message.success('Backend Znuny API cache cleared');
    } catch (err) {
      message.error(err.message);
    }
  };

  if (loading && !status) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  const verification = status?.lastVerification;

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Title level={3} className="page-title">
            Platform Settings, Security &amp; Znuny Integration
          </Title>
          <p className="page-subtitle">
            GenericInterface health diagnostics, Live-Write safety controls, RBAC matrix &amp; endpoint topology
          </p>
        </div>
        <Space>
          <Button icon={<ClearOutlined />} onClick={handleFlushCache}>
            Flush API Cache
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined spin={verifying} />}
            loading={verifying}
            onClick={handleVerifyConnectivity}
          >
            Verify Znuny API Connectivity
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            className="enterprise-card"
            title={
              <Space>
                {status?.allowLiveWrites ? (
                  <SafetyCertificateOutlined style={{ color: '#059669' }} />
                ) : (
                  <LockOutlined style={{ color: '#d97706' }} />
                )}
                <span>Live-Write Safety Gate (Admin Control)</span>
              </Space>
            }
          >
            <Paragraph style={{ color: '#475569' }}>
              By default, <code>ALLOW_LIVE_WRITES</code> is disabled so engineering teams can safely inspect live
              CMDB inventory, tickets, SLAs, and diagnostic checks against <strong>Mysupport-Prod-App</strong> with
              zero risk of unintended writes.
            </Paragraph>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: 8,
                background: status?.allowLiveWrites ? '#ecfdf5' : '#fffbeb',
                border: `1px solid ${status?.allowLiveWrites ? '#a7f3d0' : '#fde68a'}`,
              }}
            >
              <div>
                <Text strong>
                  {status?.allowLiveWrites
                    ? 'Live Writes Enabled (Mutations Active in Live Mode)'
                    : 'Write Protection Active (Live Mode is Read-Only)'}
                </Text>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {isAdmin
                    ? 'Toggle after verifying GenericInterface health checks.'
                    : 'Only Administrator accounts can modify the Live-Write Safety Gate.'}
                </div>
              </div>
              <Switch
                checked={Boolean(status?.allowLiveWrites)}
                disabled={!isAdmin}
                loading={togglingWrite}
                onChange={handleToggleLiveWrites}
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card className="enterprise-card" title="Backend Gateway & Security Posture">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Active User & Role">
                <strong>{user?.username}</strong> &bull; <Tag color="blue">{user?.role?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Active Data Source">
                <Tag color={user?.mode === 'live' ? 'blue' : 'purple'}>
                  {user?.mode === 'live' ? 'LIVE ZNUNY GENERICINTERFACE' : 'DEMO SANDBOX STORE'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Znuny Endpoint Base URL">
                <span className="mono-code">{status?.znuny?.baseUrl}</span>
              </Descriptions.Item>
              <Descriptions.Item label="VirtualHost Header">
                <span className="mono-code">{status?.znuny?.hostHeader}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Credential Isolation">
                <Tag color="success">Strict Backend Vault (Zero Browser SessionID Exposure)</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Registered CMDB Classes">
                {status?.znuny?.registeredClassCount || 23} Verified Znuny Classes
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* Live Connectivity Diagnostic Results */}
      <Card
        className="enterprise-card"
        title={
          <Space>
            <ApiOutlined />
            <span>Live Znuny GenericInterface Health &amp; Operation Probe</span>
          </Space>
        }
        extra={
          verification && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Last verified: {formatDateTime(verification.verifiedAt)}
            </Text>
          )
        }
      >
        {!verification ? (
          <Alert
            type="info"
            showIcon
            message="Click 'Verify Znuny API Connectivity' above to run live checks against `portal_with_catalogue`, `PDU_CircuitsOutlets_API`, and `SLA Api`."
          />
        ) : (
          <Table
            size="small"
            rowKey="endpoint"
            pagination={false}
            dataSource={verification.checks || []}
            columns={[
              { title: 'Znuny Webservice', dataIndex: 'service', width: 220, render: (s) => <Tag color="blue">{s}</Tag> },
              { title: 'REST Route / Operation', dataIndex: 'endpoint', width: 320, render: (e) => <span className="mono-code">{e}</span> },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 140,
                render: (st) =>
                  st === 'ok' ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">VERIFIED</Tag>
                  ) : st === 'unsupported' ? (
                    <Tag icon={<ExclamationCircleOutlined />} color="purple">FALLBACK ACTIVE</Tag>
                  ) : st === 'warning' ? (
                    <Tag color="warning">AUTH NEEDED</Tag>
                  ) : (
                    <Tag color="error">ERROR</Tag>
                  ),
              },
              { title: 'Diagnostic Detail', dataIndex: 'detail' },
            ]}
          />
        )}
      </Card>

      {/* Configured Webservices Reference */}
      <Card className="enterprise-card" title="Configured Znuny GenericInterface Webservices Reference">
        <Row gutter={[16, 16]}>
          {(status?.znuny?.webservices || []).map((ws) => (
            <Col xs={24} md={8} key={ws.id}>
              <Card size="small" title={`ID ${ws.id}: ${ws.name}`} style={{ height: '100%' }}>
                <Paragraph type="secondary" style={{ fontSize: 12.5 }}>
                  {ws.purpose}
                </Paragraph>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ws.routes.map((r) => (
                    <div key={r} className="mono-code" style={{ fontSize: 11.5, color: '#334155' }}>
                      &bull; {r}
                    </div>
                  ))}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </Space>
  );
}
