import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Button,
  Space,
  Dropdown,
  Tag,
  Spin,
  Switch,
  Typography,
  message,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
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
} from 'recharts';
import { dashboardApi } from '../api/dashboardApi';
import { useAuth } from '../context/AuthContext';
import { exportRecordsToFile } from '../utils/exportUtils';
import { CHART_PALETTE } from '../theme/antdTheme';

const { Title, Text } = Typography;

function ReportExportMenu({ data, prefix, sheetName }) {
  return (
    <Dropdown
      menu={{
        items: [
          {
            key: 'xlsx',
            label: 'Export Excel (.xlsx)',
            onClick: () => {
              exportRecordsToFile(data, prefix, 'xlsx', sheetName);
              message.success(`Exported ${data.length} rows to Excel`);
            },
          },
          {
            key: 'csv',
            label: 'Export CSV (.csv)',
            onClick: () => {
              exportRecordsToFile(data, prefix, 'csv', sheetName);
              message.success(`Exported ${data.length} rows to CSV`);
            },
          },
        ],
      }}
    >
      <Button size="small" icon={<DownloadOutlined />} disabled={!data?.length}>
        Export
      </Button>
    </Dropdown>
  );
}

function BreakdownCard({ title, data = [], prefix }) {
  return (
    <Card
      className="enterprise-card"
      size="small"
      title={`${title} (${data.length})`}
      extra={<ReportExportMenu data={data} prefix={prefix} sheetName={title} />}
    >
      <Table
        size="small"
        rowKey="name"
        pagination={{ pageSize: 7 }}
        dataSource={data}
        columns={[
          { title: 'Category / Dimension', dataIndex: 'name' },
          {
            title: 'Count',
            dataIndex: 'value',
            width: 90,
            align: 'right',
            render: (v) => <Tag color="blue">{v}</Tag>,
          },
        ]}
      />
    </Card>
  );
}

export default function ReportsAnalyticsPage() {
  const [cmdbStats, setCmdbStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [includeComponents, setIncludeComponents] = useState(false);
  const { modeVersion } = useAuth();

  const loadReports = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      try {
        const c = await dashboardApi.getCmdbStatistics({ includeComponents, refresh: forceRefresh });
        setCmdbStats(c);
      } catch (err) {
        message.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [includeComponents]
  );

  useEffect(() => {
    loadReports(false);
  }, [loadReports, modeVersion]);

  if (loading && !cmdbStats) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" tip="Compiling live CMDB analytical reports..." />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Title level={3} className="page-title">
            CMDB Reports &amp; Compliance Analytics
          </Title>
          <p className="page-subtitle">
            Asset distribution, lifecycle posture, retired inventory &amp; data-completeness audits with CSV/Excel exports
          </p>
        </div>
        <Space wrap>
          <Space size={6}>
            <Switch size="small" checked={includeComponents} onChange={setIncludeComponents} />
            <Text style={{ fontSize: 12.5 }}>Include Sub-Components (DIMMs/Fans/Outlets/NICs)</Text>
          </Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadReports(true)}>
            Regenerate Reports
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            className="enterprise-card"
            title="Total Assets by Class"
            extra={<ReportExportMenu data={cmdbStats?.byClass || []} prefix="cmdb-by-class" sheetName="ByClass" />}
          >
            <div style={{ height: 290 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cmdbStats?.byClass || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="value" name="Assets" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            className="enterprise-card"
            title="Assets by Incident State"
            extra={<ReportExportMenu data={cmdbStats?.byInciState || []} prefix="cmdb-by-incident-state" sheetName="ByIncidentState" />}
          >
            <div style={{ height: 290 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cmdbStats?.byInciState || []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {(cmdbStats?.byInciState || []).map((_, i) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <BreakdownCard title="Assets by Location" data={cmdbStats?.byLocation || []} prefix="cmdb-by-location" />
        </Col>
        <Col xs={24} md={8}>
          <BreakdownCard title="Assets by Vendor" data={cmdbStats?.byVendor || []} prefix="cmdb-by-vendor" />
        </Col>
        <Col xs={24} md={8}>
          <BreakdownCard title="Assets by Deployment State" data={cmdbStats?.byDeplState || []} prefix="cmdb-by-deployment-state" />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={13}>
          <Card
            className="enterprise-card"
            size="small"
            title={`Data Completeness Audit — Assets Missing Metadata (${cmdbStats?.missingInfoAssets?.length || 0})`}
            extra={
              <ReportExportMenu
                data={cmdbStats?.missingInfoAssets || []}
                prefix="cmdb-missing-asset-info"
                sheetName="MissingAssetInfo"
              />
            }
          >
            <Table
              size="small"
              rowKey="id"
              pagination={{ pageSize: 8 }}
              dataSource={cmdbStats?.missingInfoAssets || []}
              columns={[
                { title: 'CI #', dataIndex: 'ciNumber', width: 120, render: (v) => <span className="mono-code">#{v}</span> },
                { title: 'CI Name', dataIndex: 'name' },
                { title: 'Class', dataIndex: 'className', width: 120 },
                {
                  title: 'Missing Attributes',
                  dataIndex: 'missingFields',
                  render: (m) => <Text type="warning">{m}</Text>,
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={11}>
          <Card
            className="enterprise-card"
            size="small"
            title={`Retired & Decommissioned Assets (${cmdbStats?.retiredAssets?.length || 0})`}
            extra={
              <ReportExportMenu
                data={(cmdbStats?.retiredAssets || []).map((r) => ({
                  ciNumber: r.ciNumber,
                  name: r.name,
                  className: r.className,
                  deplState: r.deplState,
                  serialNumber: r.serialNumber,
                  lastUpdated: r.lastUpdated,
                }))}
                prefix="cmdb-retired-assets"
                sheetName="RetiredAssets"
              />
            }
          >
            <Table
              size="small"
              rowKey="id"
              pagination={{ pageSize: 8 }}
              dataSource={cmdbStats?.retiredAssets || []}
              columns={[
                { title: 'CI #', dataIndex: 'ciNumber', width: 120, render: (v) => `#${v}` },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Class', dataIndex: 'className', width: 110 },
                { title: 'Serial', dataIndex: 'serialNumber', width: 130 },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
