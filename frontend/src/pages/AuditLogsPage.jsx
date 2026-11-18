import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Drawer,
  Dropdown,
  Typography,
  Alert,
  message,
} from 'antd';
import {
  ReloadOutlined,
  DownloadOutlined,
  SearchOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { dashboardApi } from '../api/dashboardApi';
import { useAuth } from '../context/AuthContext';
import { exportRecordsToFile } from '../utils/exportUtils';
import { formatDateTime } from '../utils/formatters';

const { Title, Text } = Typography;

function summarizeValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val;
  const entries = Object.entries(val);
  if (entries.length === 0) return '—';
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' | ');
}

export default function AuditLogsPage() {
  const [auditData, setAuditData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [recordType, setRecordType] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const { modeVersion } = useAuth();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardApi.getAuditLogs({
        search,
        recordType: recordType || undefined,
        mode: modeFilter || undefined,
        page,
        pageSize,
      });
      setAuditData(res);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, recordType, modeFilter, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, modeVersion]);

  const handleExport = (format) => {
    const rows = (auditData.items || []).map((e) => ({
      Timestamp: e.timestamp,
      User: e.user,
      Role: e.role,
      Mode: e.mode,
      Action: e.action,
      'Record Type': e.recordType,
      Identifier: e.recordId,
      Summary: e.recordLabel,
      'Previous Value': e.previousValue ? JSON.stringify(e.previousValue) : '',
      'New Value': e.newValue ? JSON.stringify(e.newValue) : '',
    }));
    exportRecordsToFile(rows, 'atlancis-audit-trail', format, 'AuditLogs');
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Title level={3} className="page-title">
            Immutable Governance &amp; Audit Logs
          </Title>
          <p className="page-subtitle">
            Backend-verified audit trail recording user, action, CI/Ticket identifier, before/after state &amp; timestamp
          </p>
        </div>
        <Space wrap>
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', label: 'Export Audit Logs (.xlsx)', onClick: () => handleExport('xlsx') },
                { key: 'csv', label: 'Export Audit Logs (.csv)', onClick: () => handleExport('csv') },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />}>Export</Button>
          </Dropdown>
          <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      <Alert
        type="success"
        showIcon
        message="Strict Confirmation Integrity"
        description="Audit log records are persisted by the Express API gateway strictly AFTER Znuny GenericInterface (or the Demo sandbox store) confirms the operation succeeded."
      />

      <Card className="enterprise-card" styles={{ body: { padding: '14px 16px' } }}>
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search User, Action, CI #, Ticket #..."
            style={{ width: 290 }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            style={{ width: 175 }}
            value={recordType}
            onChange={(v) => {
              setRecordType(v);
              setPage(1);
            }}
            options={[
              { label: 'All Record Types', value: '' },
              { label: 'CMDB', value: 'CMDB' },
              { label: 'Ticket', value: 'Ticket' },
              { label: 'Relationship', value: 'Relationship' },
              { label: 'Settings', value: 'Settings' },
              { label: 'Session', value: 'Session' },
            ]}
          />
          <Select
            style={{ width: 165 }}
            value={modeFilter}
            onChange={(v) => {
              setModeFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Environments', value: '' },
              { label: 'Live Znuny API', value: 'live' },
              { label: 'Demo Sandbox', value: 'demo' },
            ]}
          />
        </Space>
      </Card>

      <Card className="enterprise-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={auditData.items || []}
          scroll={{ x: 1350 }}
          pagination={{
            current: page,
            pageSize,
            total: auditData.total || 0,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showSizeChanger: true,
            style: { padding: '12px 18px', margin: 0 },
          }}
          columns={[
            {
              title: 'Timestamp',
              dataIndex: 'timestamp',
              width: 165,
              render: (t) => <span style={{ fontSize: 12.5 }}>{formatDateTime(t)}</span>,
            },
            {
              title: 'User',
              dataIndex: 'user',
              width: 145,
              render: (u, r) => (
                <div>
                  <Text strong>{u}</Text>
                  <div>
                    <Tag style={{ fontSize: 10 }}>{r.role}</Tag>
                    <Tag color={r.mode === 'live' ? 'blue' : 'purple'} style={{ fontSize: 10 }}>
                      {r.mode}
                    </Tag>
                  </div>
                </div>
              ),
            },
            {
              title: 'Action Performed',
              dataIndex: 'action',
              width: 175,
              render: (a) => <Tag color="geekblue">{a}</Tag>,
            },
            {
              title: 'Record Type',
              dataIndex: 'recordType',
              width: 120,
              render: (t) => <Tag>{t}</Tag>,
            },
            {
              title: 'CI / Ticket Identifier',
              dataIndex: 'recordId',
              width: 175,
              render: (id, r) => (
                <div>
                  <div className="mono-code" style={{ fontWeight: 600 }}>
                    {id}
                  </div>
                  {r.recordLabel && (
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>{r.recordLabel}</div>
                  )}
                </div>
              ),
            },
            {
              title: 'Previous Value',
              dataIndex: 'previousValue',
              width: 220,
              ellipsis: true,
              render: (v) => <span className="mono-code">{summarizeValue(v)}</span>,
            },
            {
              title: 'New Value',
              dataIndex: 'newValue',
              width: 220,
              ellipsis: true,
              render: (v) => <span className="mono-code">{summarizeValue(v)}</span>,
            },
            {
              title: 'Diff',
              width: 90,
              fixed: 'right',
              render: (_, r) => (
                <Button size="small" icon={<DiffOutlined />} onClick={() => setSelectedEntry(r)}>
                  JSON
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={Boolean(selectedEntry)}
        width={640}
        title={selectedEntry ? `Audit Payload Diff — ${selectedEntry.action}` : 'Audit Entry'}
        onClose={() => setSelectedEntry(null)}
      >
        {selectedEntry && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div>
              <Text strong>Actor:</Text> {selectedEntry.user} ({selectedEntry.role}) &bull;{' '}
              <Text strong>Timestamp:</Text> {formatDateTime(selectedEntry.timestamp)}
            </div>
            <div>
              <Text strong>Target:</Text> {selectedEntry.recordType} / <span className="mono-code">{selectedEntry.recordId}</span>
            </div>
            <Card size="small" title="Previous Value">
              <pre className="mono-code" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(selectedEntry.previousValue, null, 2)}
              </pre>
            </Card>
            <Card size="small" title="New Value">
              <pre className="mono-code" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(selectedEntry.newValue, null, 2)}
              </pre>
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
