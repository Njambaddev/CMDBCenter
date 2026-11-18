import React, { useCallback, useEffect, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  Select,
  Space,
  Tag,
  Table,
  Spin,
  Alert,
  Switch,
  Progress,
  Typography,
} from 'antd';
import {
  DatabaseOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  AlertOutlined,
  StopOutlined,
  ReloadOutlined,
  EnvironmentOutlined,
  ClusterOutlined,
  PlusOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import StatCard from '../components/common/StatCard';
import { dashboardApi } from '../api/dashboardApi';
import { useAuth } from '../context/AuthContext';
import { CHART_PALETTE } from '../theme/antdTheme';
import { formatDateTime, getDeploymentColor, getIncidentColor } from '../utils/formatters';

const { Title, Text } = Typography;

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [includeComponents, setIncludeComponents] = useState(false);
  const { modeVersion } = useAuth();
  const navigate = useNavigate();

  const loadSummary = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError('');
      try {
        const res = await dashboardApi.getSummary({
          includeComponents,
          location: selectedLocation,
          refresh: forceRefresh,
        });
        setData(res);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [includeComponents, selectedLocation]
  );

  useEffect(() => {
    loadSummary(false);
  }, [loadSummary, modeVersion]);

  const buildInventoryUrl = (extraParams = {}) => {
    const qs = new URLSearchParams();
    if (selectedLocation && selectedLocation !== 'ALL') {
      qs.set('location', selectedLocation);
    }
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) qs.set(k, v);
    }
    const str = qs.toString();
    return str ? `/cmdb?${str}` : '/cmdb';
  };

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '90px 0' }}>
        <Spin size="large" tip="Loading live CMDB Configuration Items from Znuny..." />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert
        type="error"
        showIcon
        message="Unable to load CMDB Overview"
        description={error}
        action={
          <Button onClick={() => loadSummary(true)} icon={<ReloadOutlined />}>
            Retry
          </Button>
        }
      />
    );
  }

  const cmdb = data?.cmdb || {
    kpis: {},
    byClass: [],
    byLocation: [],
    byVendor: [],
    byDeplState: [],
    healthByClass: [],
    missingInfoAssets: [],
  };

  const locationSummaries = data?.locationSummaries || [];
  const availableLocations = data?.availableLocations || [];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Space align="center" size={10} wrap>
            <Title level={3} className="page-title" style={{ margin: 0 }}>
              Executive CMDB Infrastructure Overview
            </Title>
            {selectedLocation !== 'ALL' && (
              <Tag
                color="purple"
                icon={<EnvironmentOutlined />}
                closable
                onClose={() => setSelectedLocation('ALL')}
                style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: 6 }}
              >
                Filtered Site: {selectedLocation}
              </Tag>
            )}
          </Space>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Live asset inventory, per-location posture, infrastructure health &amp; lifecycle management on Znuny
          </p>
        </div>

        <Space wrap>
          <Select
            style={{ minWidth: 240 }}
            showSearch
            value={selectedLocation}
            onChange={(val) => setSelectedLocation(val)}
            options={[
              { label: `All Locations (${data?.totalGlobalCIs ?? cmdb.kpis.total ?? 0})`, value: 'ALL' },
              ...availableLocations.map((loc) => ({
                label: `${loc.location} (${loc.total})`,
                value: loc.location,
              })),
            ]}
          />
          <Space size={6}>
            <Switch size="small" checked={includeComponents} onChange={setIncludeComponents} />
            <Text style={{ fontSize: 12.5 }}>Sub-Components</Text>
          </Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadSummary(true)}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(buildInventoryUrl())}>
            Manage CIs &amp; Classes
          </Button>
        </Space>
      </div>

      {/* Section 1: CMDB Executive KPIs (Scoped to Selected Location or All Locations) */}
      <div>
        <Text strong style={{ fontSize: 13, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {selectedLocation === 'ALL'
            ? 'Global CMDB Infrastructure Posture'
            : `Site Infrastructure Posture — ${selectedLocation}`}
        </Text>
        <Row gutter={[14, 14]} style={{ marginTop: 8 }}>
          <Col xs={12} sm={8} lg={4}>
            <StatCard
              title="Total CIs"
              value={cmdb.kpis.total}
              subtitle={`${cmdb.byClass?.length || 0} active classes`}
              icon={<DatabaseOutlined />}
              accentColor="#2563eb"
              bgTint="#eff6ff"
              onClick={() => navigate(buildInventoryUrl())}
            />
          </Col>
          <Col xs={12} sm={8} lg={5}>
            <StatCard
              title="Operational CIs"
              value={cmdb.kpis.operational}
              subtitle="Healthy productive assets"
              icon={<CheckCircleOutlined />}
              accentColor="#059669"
              bgTint="#ecfdf5"
              onClick={() => navigate(buildInventoryUrl({ inciState: 'Operational' }))}
            />
          </Col>
          <Col xs={12} sm={8} lg={5}>
            <StatCard
              title="Warning State"
              value={cmdb.kpis.warning}
              subtitle="Degraded / predictive alert"
              icon={<WarningOutlined />}
              accentColor="#d97706"
              bgTint="#fffbeb"
              onClick={() => navigate(buildInventoryUrl({ inciState: 'Warning' }))}
            />
          </Col>
          <Col xs={12} sm={12} lg={5}>
            <StatCard
              title="Incident State"
              value={cmdb.kpis.incident}
              subtitle="Active infrastructure fault"
              icon={<AlertOutlined />}
              accentColor="#dc2626"
              bgTint="#fef2f2"
              onClick={() => navigate(buildInventoryUrl({ inciState: 'Incident' }))}
            />
          </Col>
          <Col xs={12} sm={12} lg={5}>
            <StatCard
              title="Retired / Inactive"
              value={cmdb.kpis.retired}
              subtitle="Decommissioned assets"
              icon={<StopOutlined />}
              accentColor="#64748b"
              bgTint="#f1f5f9"
              onClick={() => navigate(buildInventoryUrl({ deplState: 'Retired' }))}
            />
          </Col>
        </Row>
      </div>

      {/* Section 2: Interactive Overview per Location / Site */}
      {locationSummaries.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Space size={8}>
              <EnvironmentOutlined style={{ color: '#7c3aed' }} />
              <Text strong style={{ fontSize: 13, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Overview per Location / Data Center ({locationSummaries.length} Sites)
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                — Click any location card to filter the dashboard
              </Text>
            </Space>
            {selectedLocation !== 'ALL' && (
              <Button size="small" icon={<CloseCircleOutlined />} onClick={() => setSelectedLocation('ALL')}>
                Show All Locations
              </Button>
            )}
          </div>

          <Row gutter={[14, 14]}>
            {locationSummaries.map((loc) => {
              const isSelected = selectedLocation === loc.location;
              const hasIssues = loc.incident > 0 || loc.warning > 0;
              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={loc.location}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => setSelectedLocation(isSelected ? 'ALL' : loc.location)}
                    style={{
                      height: '100%',
                      borderRadius: 10,
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: isSelected ? '#f8faff' : '#ffffff',
                      boxShadow: isSelected ? '0 6px 18px rgba(37, 99, 235, 0.14)' : undefined,
                    }}
                    styles={{ body: { padding: '14px 16px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <Text strong ellipsis style={{ fontSize: 14, color: '#0f172a', display: 'block' }}>
                          <EnvironmentOutlined style={{ color: isSelected ? '#2563eb' : '#7c3aed', marginRight: 6 }} />
                          {loc.location}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {loc.classCount} CI {loc.classCount === 1 ? 'class' : 'classes'} deployed
                        </Text>
                      </div>
                      <Tag color={loc.incident > 0 ? 'error' : loc.warning > 0 ? 'warning' : 'success'} style={{ margin: 0 }}>
                        {loc.healthPct}% Healthy
                      </Tag>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 }}>
                      <div>
                        <span style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{loc.total}</span>
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>Total CIs</span>
                      </div>
                      <Space size={4}>
                        <Tag color="green" style={{ margin: 0, fontSize: 11 }}>
                          Op: {loc.operational}
                        </Tag>
                        {loc.warning > 0 && (
                          <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
                            Warn: {loc.warning}
                          </Tag>
                        )}
                        {loc.incident > 0 && (
                          <Tag color="red" style={{ margin: 0, fontSize: 11 }}>
                            Inc: {loc.incident}
                          </Tag>
                        )}
                      </Space>
                    </div>

                    <Progress
                      percent={loc.healthPct}
                      size="small"
                      showInfo={false}
                      strokeColor={hasIssues ? (loc.incident > 0 ? '#dc2626' : '#d97706') : '#059669'}
                      style={{ margin: '6px 0 8px' }}
                    />

                    <div style={{ minHeight: 26 }}>
                      <Space size={[4, 4]} wrap>
                        {(loc.topClasses || []).map((tc) => (
                          <Tag key={tc.name} style={{ margin: 0, fontSize: 11 }}>
                            {tc.name}: {tc.count}
                          </Tag>
                        ))}
                      </Space>
                    </div>

                    <div
                      style={{
                        borderTop: '1px solid #f1f5f9',
                        marginTop: 10,
                        paddingTop: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11.5 }}>
                        {isSelected ? 'Active filter (click to clear)' : 'Click card to filter'}
                      </Text>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto', fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/cmdb?location=${encodeURIComponent(loc.location)}`);
                        }}
                      >
                        Open Inventory &rarr;
                      </Button>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      )}

      {/* Section 3: CMDB Recharts Visualizations */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            className="enterprise-card"
            title={`1. CMDB Asset Distribution by Class${selectedLocation !== 'ALL' ? ` (${selectedLocation})` : ''}`}
          >
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(cmdb.byClass || []).slice(0, 12)} layout="vertical" margin={{ left: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Bar
                    dataKey="value"
                    name="Configuration Items"
                    fill="#2563eb"
                    radius={[0, 5, 5, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(bar) => bar?.name && navigate(buildInventoryUrl({ className: bar.name }))}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            className="enterprise-card"
            title={`2. Infrastructure Health Overview by Class${selectedLocation !== 'ALL' ? ` (${selectedLocation})` : ''}`}
          >
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cmdb.healthByClass || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="Operational" stackId="health" fill="#059669" />
                  <Bar dataKey="Warning" stackId="health" fill="#d97706" />
                  <Bar dataKey="Incident" stackId="health" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card className="enterprise-card" title="3. Assets by Deployment State">
            <div style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cmdb.byDeplState || []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {(cmdb.byDeplState || []).map((_, idx) => (
                      <Cell key={idx} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card className="enterprise-card" title="4. Assets by Location / Site (Click Bar to Filter)">
            <div style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={locationSummaries.slice(0, 8).map((l) => ({ name: l.location, value: l.total }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar
                    dataKey="value"
                    name="Assets"
                    fill="#7c3aed"
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(bar) => {
                      if (bar?.name) {
                        setSelectedLocation((prev) => (prev === bar.name ? 'ALL' : bar.name));
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={6}>
          <Card className="enterprise-card" title="Top Vendors & Metadata Gaps" style={{ height: '100%' }}>
            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ fontSize: 12, color: '#475569' }}>
                <ClusterOutlined /> TOP VENDORS
              </Text>
              {(cmdb.byVendor || []).slice(0, 6).map((v) => (
                <div key={v.name} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text ellipsis style={{ maxWidth: 155, fontSize: 12.5 }}>
                    {v.name}
                  </Text>
                  <Tag color="blue" style={{ margin: 0 }}>
                    {v.value}
                  </Tag>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <Text strong style={{ fontSize: 12, color: '#475569' }}>
                <EnvironmentOutlined /> METADATA AUDIT
              </Text>
              <div style={{ marginTop: 6, fontSize: 12.5, color: '#64748b' }}>
                <strong>{cmdb.missingInfoAssets?.length || 0}</strong> active CIs have missing Serial, Vendor, Model, or Location fields.{' '}
                <a onClick={() => navigate('/reports')}>View Report &rarr;</a>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Section 4: Actionable CMDB Watchlists */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={11}>
          <Card
            className="enterprise-card"
            title="Configuration Items Requiring Attention"
            extra={
              <Button type="link" size="small" onClick={() => navigate(buildInventoryUrl({ inciState: 'Warning' }))}>
                Filter Unhealthy
              </Button>
            }
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data?.attentionCIs || []}
              locale={{ emptyText: 'All productive CIs in this view are currently Operational' }}
              columns={[
                {
                  title: 'CI Name',
                  dataIndex: 'name',
                  render: (n, r) => (
                    <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => navigate(`/cmdb?openId=${r.id}`)}>
                      {n}
                    </Button>
                  ),
                },
                { title: 'Class', dataIndex: 'className', width: 130, render: (c) => <Tag color="blue">{c}</Tag> },
                {
                  title: 'Incident State',
                  dataIndex: 'inciState',
                  width: 115,
                  render: (s) => <Tag color={getIncidentColor(s)}>{s}</Tag>,
                },
                { title: 'Location', dataIndex: 'location', ellipsis: true },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card
            className="enterprise-card"
            title="Recently Updated / Collected Configuration Items"
            extra={
              <Button type="link" size="small" onClick={() => navigate(buildInventoryUrl())}>
                Open Inventory
              </Button>
            }
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data?.recentlyUpdatedCIs || []}
              columns={[
                {
                  title: 'CI #',
                  dataIndex: 'ciNumber',
                  width: 120,
                  render: (num, r) => (
                    <Button type="link" className="mono-code" style={{ padding: 0 }} onClick={() => navigate(`/cmdb?openId=${r.id}`)}>
                      #{num}
                    </Button>
                  ),
                },
                { title: 'Name', dataIndex: 'name', ellipsis: true },
                { title: 'Class', dataIndex: 'className', width: 125, render: (c) => <Tag>{c}</Tag> },
                {
                  title: 'Deployment',
                  dataIndex: 'deplState',
                  width: 110,
                  render: (s) => <Tag color={getDeploymentColor(s)}>{s}</Tag>,
                },
                {
                  title: 'Last Updated',
                  dataIndex: 'lastUpdated',
                  width: 145,
                  render: (d) => <span style={{ fontSize: 12 }}>{formatDateTime(d)}</span>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
