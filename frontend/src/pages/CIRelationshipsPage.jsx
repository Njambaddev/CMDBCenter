import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Select,
  Input,
  Alert,
  Popconfirm,
  Spin,
  Switch,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { relationshipApi } from '../api/relationshipApi';
import { cmdbApi } from '../api/cmdbApi';
import { useAuth } from '../context/AuthContext';
import TopologyDiagram from '../components/relationships/TopologyDiagram';
import CIDetailDrawer from '../components/cmdb/CIDetailDrawer';
import { getIncidentColor } from '../utils/formatters';

const { Title, Text } = Typography;

const LINK_TYPES = [
  { label: 'Includes (Parent Chassis / Rack / Host -> Child)', value: 'Includes' },
  { label: 'ConnectedTo (Switch / PDU / Circuit -> Device)', value: 'ConnectedTo' },
  { label: 'DependsOn (Application / VM -> Underlying Infra)', value: 'DependsOn' },
  { label: 'AlternativeTo (HA / Redundant Peer)', value: 'AlternativeTo' },
  { label: 'RelevantTo (Operational Association)', value: 'RelevantTo' },
];

export default function CIRelationshipsPage() {
  const [graph, setGraph] = useState({ nodes: [], edges: [], linkApiSupported: true, statusReason: null });
  const [loading, setLoading] = useState(true);
  const [includeComponents, setIncludeComponents] = useState(false);
  const [search, setSearch] = useState('');

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeCI, setActiveCI] = useState(null);

  const { canWriteEffective, modeVersion } = useAuth();
  const navigate = useNavigate();

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await relationshipApi.getGraph({ includeComponents });
      setGraph(res);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [includeComponents]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph, modeVersion]);

  const inspectCI = async (ciId) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await cmdbApi.getById(ciId);
      setActiveCI(full);
    } catch (err) {
      message.error(err.message);
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateRelationship = async (values) => {
    setCreating(true);
    try {
      await relationshipApi.create({
        sourceType: 'ITSMConfigItem',
        sourceId: values.sourceId,
        targetType: 'ITSMConfigItem',
        targetId: values.targetId,
        linkType: values.linkType,
        description: values.description || '',
      });
      message.success('Configuration Item relationship created');
      setLinkModalOpen(false);
      form.resetFields();
      loadGraph();
    } catch (err) {
      message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRelationship = async (rel) => {
    try {
      await relationshipApi.remove(rel.id, {
        sourceType: rel.sourceType,
        sourceId: rel.sourceId,
        targetType: rel.targetType,
        targetId: rel.targetId,
        linkType: rel.linkType,
      });
      message.success('Relationship removed');
      loadGraph();
    } catch (err) {
      message.error(err.message);
    }
  };

  const filteredEdges = useMemo(() => {
    if (!search.trim()) return graph.edges || [];
    const q = search.trim().toLowerCase();
    return (graph.edges || []).filter(
      (e) =>
        e.source?.name?.toLowerCase().includes(q) ||
        e.target?.name?.toLowerCase().includes(q) ||
        e.source?.className?.toLowerCase().includes(q) ||
        e.target?.className?.toLowerCase().includes(q) ||
        e.linkType?.toLowerCase().includes(q)
    );
  }, [graph.edges, search]);

  const nodeOptions = useMemo(
    () =>
      (graph.nodes || []).map((n) => ({
        label: `${n.name} (${n.className} • #${n.ciNumber})`,
        value: n.id,
      })),
    [graph.nodes]
  );

  const canMutateLinks = canWriteEffective && graph.linkApiSupported;

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Title level={3} className="page-title">
            CI Relationships &amp; Infrastructure Dependencies
          </Title>
          <p className="page-subtitle">
            Parent-child hierarchies, power feeds, network uplinks &amp; workload impact chains
          </p>
        </div>
        <Space wrap>
          <Space size={6}>
            <Switch size="small" checked={includeComponents} onChange={setIncludeComponents} />
            <Text style={{ fontSize: 12.5 }}>Include Granular DIMM/Fan/Outlet Links</Text>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={loadGraph} loading={loading}>
            Refresh Topology
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canMutateLinks}
            onClick={() => setLinkModalOpen(true)}
          >
            Link Configuration Items
          </Button>
        </Space>
      </div>

      {!graph.linkApiSupported && graph.statusReason && (
        <Alert
          type="warning"
          showIcon
          message="Live Znuny `Link::*` Operation Module Notice"
          description={`${graph.statusReason} Switch to Demo Mode in the top bar at any time to test interactive Link creation and deletion workflows.`}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '70px 0' }}>
          <Spin size="large" tip="Building infrastructure dependency graph..." />
        </div>
      ) : (
        <>
          <TopologyDiagram
            nodes={graph.nodes || []}
            edges={graph.edges || []}
            onSelectNode={(id) => inspectCI(id)}
          />

          <Card
            className="enterprise-card"
            title={`Parent / Child & Dependency Matrix (${filteredEdges.length})`}
            extra={
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Filter by CI name, class, or link type..."
                style={{ width: 290 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            }
          >
            <Table
              size="small"
              rowKey="id"
              dataSource={filteredEdges}
              pagination={{ pageSize: 15, showSizeChanger: true }}
              columns={[
                {
                  title: 'Parent / Upstream CI',
                  render: (_, r) => (
                    <Space>
                      <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => inspectCI(r.source?.id)}>
                        {r.source?.name}
                      </Button>
                      <Tag color="blue">{r.source?.className}</Tag>
                      <Tag color={getIncidentColor(r.source?.inciState)}>{r.source?.inciState}</Tag>
                    </Space>
                  ),
                },
                {
                  title: 'Relationship',
                  dataIndex: 'linkType',
                  width: 150,
                  render: (t, r) => (
                    <Space direction="vertical" size={0}>
                      <Tag color="purple">{t}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {r.origin === 'inferred_attribute' ? 'Telemetry Correlation' : 'Znuny Object Link'}
                      </Text>
                    </Space>
                  ),
                },
                {
                  title: 'Child / Dependent CI',
                  render: (_, r) => (
                    <Space>
                      <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => inspectCI(r.target?.id)}>
                        {r.target?.name}
                      </Button>
                      <Tag color="geekblue">{r.target?.className}</Tag>
                      <Tag color={getIncidentColor(r.target?.inciState)}>{r.target?.inciState}</Tag>
                    </Space>
                  ),
                },
                {
                  title: 'Notes / Port / Slot',
                  dataIndex: 'description',
                  ellipsis: true,
                  render: (d) => d || '—',
                },
                {
                  title: 'Action',
                  width: 95,
                  render: (_, r) => (
                    <Popconfirm
                      title="Remove this CI relationship?"
                      okText="Remove"
                      okButtonProps={{ danger: true }}
                      disabled={!canMutateLinks || r.origin === 'inferred_attribute'}
                      onConfirm={() => handleDeleteRelationship(r)}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={!canMutateLinks || r.origin === 'inferred_attribute'}
                      />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      <Modal
        open={linkModalOpen}
        title="Link Configuration Items"
        okText="Create Relationship"
        confirmLoading={creating}
        onCancel={() => setLinkModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ linkType: 'Includes' }}
          onFinish={handleCreateRelationship}
        >
          <Form.Item
            name="sourceId"
            label="Parent / Upstream Configuration Item"
            rules={[{ required: true, message: 'Select upstream CI' }]}
          >
            <Select showSearch optionFilterProp="label" placeholder="Select Parent CI..." options={nodeOptions} />
          </Form.Item>

          <Form.Item name="linkType" label="Relationship Type" rules={[{ required: true }]}>
            <Select options={LINK_TYPES} />
          </Form.Item>

          <Form.Item
            name="targetId"
            label="Child / Dependent Configuration Item"
            rules={[{ required: true, message: 'Select downstream CI' }]}
          >
            <Select showSearch optionFilterProp="label" placeholder="Select Child/Dependent CI..." options={nodeOptions} />
          </Form.Item>

          <Form.Item name="description" label="Connection / Slot / Dependency Context">
            <Input placeholder="e.g. 25GbE Leaf Uplink Et1/4 or OpenRack Sled Bay 03" />
          </Form.Item>
        </Form>
      </Modal>

      <CIDetailDrawer
        open={detailOpen}
        loading={detailLoading}
        ci={activeCI}
        canWrite={false}
        onClose={() => setDetailOpen(false)}
        onInspectCI={(id) => inspectCI(id)}
        onInspectTicket={(ticketId) => navigate(`/tickets?openTicketId=${ticketId}`)}
      />
    </Space>
  );
}
