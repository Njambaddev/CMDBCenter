import React from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Space,
  Button,
  Tabs,
  Table,
  Timeline,
  Empty,
  Spin,
  Typography,
  Card,
  Row,
  Col,
  Popconfirm,
  Alert,
} from 'antd';
import {
  EditOutlined,
  StopOutlined,
  DeploymentUnitOutlined,
  CustomerServiceOutlined,
  HistoryOutlined,
  ClusterOutlined,
} from '@ant-design/icons';
import {
  formatDateTime,
  getDeploymentColor,
  getIncidentColor,
  getPriorityColor,
  getTicketStateColor,
} from '../../utils/formatters';

const { Text, Title } = Typography;

function AttributeGrid({ items = [] }) {
  if (!items || items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attributes populated in this section" />;
  }
  return (
    <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
      {items.map((item) => (
        <Descriptions.Item key={item.key} label={item.label}>
          <span className="mono-code">{String(item.value || '—')}</span>
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
}

export default function CIDetailDrawer({
  open,
  loading,
  ci,
  canWrite,
  onClose,
  onEdit,
  onRetire,
  onInspectCI,
  onInspectTicket,
}) {
  if (!open) return null;

  const sections = ci?.sections || {};
  const parents = ci?.relationships?.parents || [];
  const children = ci?.relationships?.children || [];
  const versionHistory = ci?.versionHistory || [];

  const renderRelList = (rels, direction) => {
    if (!rels.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${direction} components`} />;
    return (
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={rels}
        columns={[
          {
            title: 'Relationship',
            dataIndex: 'linkType',
            width: 120,
            render: (t) => <Tag color="geekblue">{t}</Tag>,
          },
          {
            title: direction === 'upstream' ? 'Parent / Upstream CI' : 'Child / Dependent CI',
            render: (_, rec) => {
              const node = direction === 'upstream' ? rec.source : rec.target;
              return (
                <Button
                  type="link"
                  style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                  onClick={() => node?.id && onInspectCI?.(node.id)}
                >
                  {node?.name} ({node?.number || `#${node?.id}`})
                </Button>
              );
            },
          },
          {
            title: 'Class',
            render: (_, rec) => {
              const node = direction === 'upstream' ? rec.source : rec.target;
              return <Tag>{node?.className}</Tag>;
            },
          },
          {
            title: 'Health',
            render: (_, rec) => {
              const node = direction === 'upstream' ? rec.source : rec.target;
              return <Tag color={getIncidentColor(node?.inciState)}>{node?.inciState || 'Operational'}</Tag>;
            },
          },
          {
            title: 'Context',
            dataIndex: 'description',
            render: (d, rec) => (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {d || (rec.origin === 'inferred_attribute' ? 'Inferred via Hostname/BMC telemetry' : 'Znuny Link')}
              </Text>
            ),
          },
        ]}
      />
    );
  };

  const tabItems = [
    {
      key: 'overview',
      label: 'Attributes & Specs',
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small" title="General & Lifecycle Information" className="enterprise-card">
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="CI Number">
                <span className="mono-code">{ci?.ciNumber}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Znuny ConfigItemID">{ci?.id}</Descriptions.Item>
              <Descriptions.Item label="CI Class">
                <Tag color="blue">{ci?.className}</Tag> <Text type="secondary">{ci?.classLabel}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Category">{ci?.category}</Descriptions.Item>
              <Descriptions.Item label="Deployment State">
                <Tag color={getDeploymentColor(ci?.deplState)}>{ci?.deplState}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Incident State">
                <Tag color={getIncidentColor(ci?.inciState)}>{ci?.inciState}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Created">{formatDateTime(ci?.createdTime)}</Descriptions.Item>
              <Descriptions.Item label="Last Updated">{formatDateTime(ci?.lastUpdated)}</Descriptions.Item>
            </Descriptions>
            {sections.general?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <AttributeGrid items={sections.general} />
              </div>
            )}
          </Card>

          <Card size="small" title="Hardware Information" className="enterprise-card">
            <AttributeGrid items={sections.hardware} />
          </Card>

          <Card size="small" title="Network Information" className="enterprise-card">
            <AttributeGrid items={sections.network} />
          </Card>

          <Row gutter={14}>
            <Col xs={24} md={12}>
              <Card size="small" title="Ownership & Customer" className="enterprise-card">
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="Owner / Customer">{ci?.owner || '—'}</Descriptions.Item>
                </Descriptions>
                {sections.ownership?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <AttributeGrid items={sections.ownership} />
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="Location & Rack Placement" className="enterprise-card">
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="Resolved Location">{ci?.location || '—'}</Descriptions.Item>
                </Descriptions>
                {sections.location?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <AttributeGrid items={sections.location} />
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      ),
    },
    {
      key: 'infrastructure',
      label: (
        <span>
          <DeploymentUnitOutlined /> Related CIs ({parents.length + children.length})
        </span>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {ci?.relationships?.statusReason && (
            <Alert type="info" showIcon message={ci.relationships.statusReason} />
          )}
          <Card size="small" title={<><ClusterOutlined /> Upstream / Parent Infrastructure ({parents.length})</>}>
            {renderRelList(parents, 'upstream')}
          </Card>
          <Card size="small" title={<><DeploymentUnitOutlined /> Downstream / Linked Components ({children.length})</>}>
            {renderRelList(children, 'downstream')}
          </Card>
        </Space>
      ),
    },
    {
      key: 'history',
      label: (
        <span>
          <HistoryOutlined /> Change History ({versionHistory.length})
        </span>
      ),
      children: versionHistory.length ? (
        <Timeline
          style={{ marginTop: 12 }}
          items={versionHistory.map((v) => ({
            color: v.inciState === 'Incident' ? 'red' : v.deplState === 'Retired' ? 'gray' : 'blue',
            children: (
              <div>
                <Space size={8}>
                  <Text strong>Version #{v.versionId}</Text>
                  <Tag color={getDeploymentColor(v.deplState)}>{v.deplState}</Tag>
                  <Tag color={getIncidentColor(v.inciState)}>{v.inciState}</Tag>
                </Space>
                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>
                  {v.note || 'Configuration version recorded'} &bull; by <strong>{v.changedBy || 'Znuny'}</strong>
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{formatDateTime(v.changedAt)}</div>
              </div>
            ),
          }))}
        />
      ) : (
        <Empty description="Single baseline version recorded" />
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      width={880}
      onClose={onClose}
      title={
        ci ? (
          <div>
            <Space size={8} wrap>
              <Title level={5} style={{ margin: 0 }}>
                {ci.name}
              </Title>
              <Tag color="blue">{ci.className}</Tag>
              <Tag color={getDeploymentColor(ci.deplState)}>{ci.deplState}</Tag>
              <Tag color={getIncidentColor(ci.inciState)}>{ci.inciState}</Tag>
            </Space>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginTop: 2 }}>
              CI #{ci.ciNumber} &bull; Vendor: {ci.vendor} &bull; Model: {ci.model} &bull; Serial: {ci.serialNumber}
            </div>
          </div>
        ) : (
          'Configuration Item Details'
        )
      }
      extra={
        ci && (
          <Space>
            <Button icon={<EditOutlined />} disabled={!canWrite} onClick={() => onEdit?.(ci)}>
              Edit CI
            </Button>
            {ci.deplState !== 'Retired' && (
              <Popconfirm
                title="Retire Configuration Item?"
                description={`Transition "${ci.name}" (#${ci.ciNumber}) to Deployment State = Retired?`}
                okText="Confirm Retire"
                okButtonProps={{ danger: true }}
                disabled={!canWrite}
                onConfirm={() => onRetire?.(ci)}
              >
                <Button danger icon={<StopOutlined />} disabled={!canWrite}>
                  Retire CI
                </Button>
              </Popconfirm>
            )}
          </Space>
        )
      }
    >
      {loading || !ci ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" tip="Loading Znuny Configuration Item..." />
        </div>
      ) : (
        <Tabs items={tabItems} />
      )}
    </Drawer>
  );
}
