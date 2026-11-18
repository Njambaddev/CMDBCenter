import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Tabs, Select, Alert, Typography, Space, Divider, Tag } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  ApiOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/authApi';
import { BRAND } from '../config/brand';

const { Title, Text, Paragraph } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [demoRole, setDemoRole] = useState('admin');
  const [publicConfig, setPublicConfig] = useState({ demoEnabled: false, znunyHost: '', cmdbWebservice: '' });
  const { login, loginDemo } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    authApi
      .getPublicConfig()
      .then((cfg) => setPublicConfig((prev) => ({ ...prev, ...cfg })))
      .catch(() => {});
  }, []);

  const handleLiveLogin = async (values) => {
    setErrorMsg('');
    setLoading(true);
    try {
      await login({ username: values.username, password: values.password, mode: 'live' });
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDemo = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await loginDemo({ role: demoRole });
      navigate('/');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const liveForm = (
    <Form layout="vertical" onFinish={handleLiveLogin} size="large">
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message={`Sign in with your Znuny Agent account. ${BRAND.name} works directly on the live CMDB${
          publicConfig.znunyHost ? ` at ${publicConfig.znunyHost}` : ''
        }${publicConfig.cmdbWebservice ? ` via the ${publicConfig.cmdbWebservice} webservice` : ''}.`}
      />
      <Form.Item
        name="username"
        label="Znuny Agent Username"
        rules={[{ required: true, message: 'Enter your Znuny Agent login' }]}
      >
        <Input prefix={<UserOutlined />} placeholder="Your Znuny agent login" autoComplete="username" />
      </Form.Item>
      <Form.Item
        name="password"
        label="Password"
        rules={[{ required: true, message: 'Enter your Znuny Agent password' }]}
      >
        <Input.Password prefix={<LockOutlined />} placeholder="Znuny Agent password" autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44 }}>
        Sign In to {BRAND.name}
      </Button>
    </Form>
  );

  const demoPanel = (
    <div>
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Sample data held in memory for training and testing. Nothing here touches the live Znuny CMDB.
      </Paragraph>
      <div style={{ marginBottom: 18 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>
          Role to simulate:
        </Text>
        <Select
          size="large"
          style={{ width: '100%' }}
          value={demoRole}
          onChange={setDemoRole}
          options={[
            { label: 'Administrator', value: 'admin' },
            { label: 'NOC Operator', value: 'operator' },
            { label: 'Compliance Viewer (read-only)', value: 'viewer' },
          ]}
        />
      </div>
      <Button type="default" size="large" block loading={loading} onClick={handleStartDemo} style={{ height: 44 }}>
        Launch {BRAND.name} Demo
      </Button>
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #1d4ed8 100%)',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
        styles={{ body: { padding: '32px 34px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div
            style={{
              width: 52,
              height: 52,
              margin: '0 auto 12px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 22,
              fontWeight: 800,
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
            }}
          >
            {BRAND.logoLetter}
          </div>
          <Title level={3} style={{ margin: 0, letterSpacing: '-0.02em' }}>
            {BRAND.name}
          </Title>
          <Text type="secondary">
            {BRAND.organisation} &bull; {BRAND.tagline}
          </Text>
        </div>

        {errorMsg && (
          <Alert
            style={{ marginBottom: 16 }}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMsg('')}
            message={errorMsg}
          />
        )}

        {publicConfig.demoEnabled ? (
          <Tabs
            defaultActiveKey="live"
            items={[
              { key: 'live', label: <span><ApiOutlined /> Znuny Agent Sign-In</span>, children: liveForm },
              { key: 'demo', label: <span><ExperimentOutlined /> Demo Sandbox</span>, children: demoPanel },
            ]}
          />
        ) : (
          liveForm
        )}

        <Divider style={{ margin: '18px 0 12px' }} />
        <Space size={6} wrap style={{ justifyContent: 'center', width: '100%' }}>
          <Tag color="blue">Znuny 6.5 GenericInterface</Tag>
          <Tag color="purple">Live CMDB Data</Tag>
          <Tag color="green">Write-Guard Protected</Tag>
        </Space>
      </Card>
    </div>
  );
}
