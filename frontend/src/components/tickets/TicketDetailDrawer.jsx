import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Space,
  Button,
  Tabs,
  Select,
  Input,
  Radio,
  Card,
  Timeline,
  Spin,
  Empty,
  Typography,
  Row,
  Col,
  Divider,
  Table,
  message,
} from 'antd';
import {
  SendOutlined,
  LockOutlined,
  GlobalOutlined,
  PaperClipOutlined,
  DeploymentUnitOutlined,
  HistoryOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  formatDateTime,
  formatSlaCountdown,
  getIncidentColor,
  getPriorityColor,
  getSlaStatusMeta,
  getTicketStateColor,
} from '../../utils/formatters';
import { ticketApi } from '../../api/ticketApi';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

export default function TicketDetailDrawer({
  open,
  loading,
  ticket,
  catalogs,
  ciOptions = [],
  canWrite,
  updating = false,
  onClose,
  onUpdateTicket,
  onInspectCI,
}) {
  const [queue, setQueue] = useState('');
  const [state, setState] = useState('');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState('');
  const [responsible, setResponsible] = useState('');
  const [linkedCiIds, setLinkedCiIds] = useState([]);

  const [noteVisibility, setNoteVisibility] = useState(0);
  const [noteSubject, setNoteSubject] = useState('');
  const [noteBody, setNoteBody] = useState('');

  useEffect(() => {
    if (ticket) {
      setQueue(ticket.queue || '');
      setState(ticket.state || '');
      setPriority(ticket.priority || '');
      setOwner(ticket.owner || '');
      setResponsible(ticket.responsible || '');
      setLinkedCiIds((ticket.linkedCIs || []).map((c) => Number(c.id)));
      setNoteSubject('');
      setNoteBody('');
    }
  }, [ticket]);

  if (!open) return null;

  const slaMeta = getSlaStatusMeta(ticket?.slaStatus);

  const handleSaveProperties = async () => {
    await onUpdateTicket({
      queue,
      state,
      priority,
      owner,
      responsible,
      linkedCiIds,
    });
  };

  const handleAddArticle = async () => {
    if (!noteBody.trim()) {
      message.warning('Enter message content before posting an article.');
      return;
    }
    await onUpdateTicket({
      queue,
      state,
      priority,
      owner,
      responsible,
      linkedCiIds,
      article: {
        subject: noteSubject.trim() || (noteVisibility === 1 ? `Re: ${ticket.title}` : 'Internal Technical Note'),
        body: noteBody.trim(),
        isVisibleForCustomer: noteVisibility === 1,
      },
    });
    setNoteSubject('');
    setNoteBody('');
  };

  const handleDownload = async (articleId, att) => {
    try {
      await ticketApi.downloadAttachment(ticket.id, articleId, att.attachmentId, att.filename);
    } catch (err) {
      message.error(`Attachment download failed: ${err.message}`);
    }
  };

  const tabItems = [
    {
      key: 'workspace',
      label: `Agent Workspace & Articles (${ticket?.articles?.length || 0})`,
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Quick Triage & Assignment Controls */}
          <Card size="small" title="Ticket Triage, Assignment & Infrastructure Association" className="enterprise-card">
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>State</Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={!canWrite}
                  value={state}
                  onChange={setState}
                  options={(catalogs?.states || []).map((s) => ({ label: s, value: s }))}
                />
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Priority</Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={!canWrite}
                  value={priority}
                  onChange={setPriority}
                  options={(catalogs?.priorities || []).map((p) => ({ label: p.name, value: p.name }))}
                />
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Queue</Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  showSearch
                  disabled={!canWrite}
                  value={queue}
                  onChange={setQueue}
                  options={(catalogs?.queues || []).map((q) => ({ label: q.name, value: q.name }))}
                />
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Owner Agent</Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  showSearch
                  disabled={!canWrite}
                  value={owner}
                  onChange={setOwner}
                  options={(catalogs?.agents || []).map((a) => ({ label: a, value: a }))}
                />
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Responsible Agent</Text>
                <Select
                  style={{ width: '100%', marginTop: 4 }}
                  showSearch
                  disabled={!canWrite}
                  value={responsible}
                  onChange={setResponsible}
                  options={(catalogs?.agents || []).map((a) => ({ label: a, value: a }))}
                />
              </Col>
              <Col xs={24} md={14}>
                <Text type="secondary" style={{ fontSize: 12 }}>Associated Configuration Items (CMDB)</Text>
                <Select
                  mode="multiple"
                  style={{ width: '100%', marginTop: 4 }}
                  showSearch
                  optionFilterProp="label"
                  disabled={!canWrite}
                  value={linkedCiIds}
                  onChange={setLinkedCiIds}
                  placeholder="Link affected servers, switches, circuits, or VMs..."
                  options={ciOptions}
                />
              </Col>
              <Col xs={24} md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button
                  type="primary"
                  block
                  icon={<SaveOutlined />}
                  disabled={!canWrite}
                  loading={updating}
                  onClick={handleSaveProperties}
                >
                  Update
                </Button>
              </Col>
            </Row>
          </Card>

          {/* Metadata & SLA Summary */}
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Customer">{ticket?.customer || '—'}</Descriptions.Item>
            <Descriptions.Item label="Customer User">{ticket?.customerUser || '—'}</Descriptions.Item>
            <Descriptions.Item label="Service">{ticket?.service || '—'}</Descriptions.Item>
            <Descriptions.Item label="SLA Policy">
              <Space>
                <span>{ticket?.sla || 'Standard'}</span>
                <Tag color={slaMeta.color}>{slaMeta.label}</Tag>
                {ticket?.escalationSecondsRemaining !== null && (
                  <Text type={ticket?.escalationSecondsRemaining < 0 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                    ({formatSlaCountdown(ticket?.escalationSecondsRemaining)})
                  </Text>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Created">{formatDateTime(ticket?.created)}</Descriptions.Item>
            <Descriptions.Item label="Last Updated">{formatDateTime(ticket?.updated)}</Descriptions.Item>
          </Descriptions>

          {/* Linked CIs Quick-Inspection Table */}
          {ticket?.linkedCIs?.length > 0 && (
            <Card
              size="small"
              title={<><DeploymentUnitOutlined /> Affected Infrastructure Configuration Items ({ticket.linkedCIs.length})</>}
              className="enterprise-card"
            >
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={ticket.linkedCIs}
                columns={[
                  {
                    title: 'CI Name',
                    dataIndex: 'name',
                    render: (n, rec) => (
                      <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => onInspectCI?.(rec.id)}>
                        {n}
                      </Button>
                    ),
                  },
                  { title: 'CI Number', dataIndex: 'ciNumber', render: (v) => <span className="mono-code">#{v}</span> },
                  { title: 'Class', dataIndex: 'className', render: (c) => <Tag color="blue">{c}</Tag> },
                  {
                    title: 'Incident State',
                    dataIndex: 'inciState',
                    render: (s) => <Tag color={getIncidentColor(s)}>{s}</Tag>,
                  },
                  { title: 'Location', dataIndex: 'location' },
                ]}
              />
            </Card>
          )}

          {/* Add Internal Note or Customer Reply */}
          <Card size="small" title="Post Internal Note or Customer Update" className="enterprise-card">
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Radio.Group
                value={noteVisibility}
                onChange={(e) => setNoteVisibility(e.target.value)}
                disabled={!canWrite}
              >
                <Radio.Button value={0}>
                  <LockOutlined /> Internal Note (Agents Only)
                </Radio.Button>
                <Radio.Button value={1}>
                  <GlobalOutlined /> Customer-Visible Reply
                </Radio.Button>
              </Radio.Group>
              <Input
                placeholder="Subject (optional)"
                value={noteSubject}
                disabled={!canWrite}
                onChange={(e) => setNoteSubject(e.target.value)}
              />
              <TextArea
                rows={3}
                placeholder={
                  noteVisibility === 0
                    ? 'Add internal root-cause notes, CLI diagnostics, or handoff instructions...'
                    : 'Write customer-facing status update...'
                }
                value={noteBody}
                disabled={!canWrite}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <div style={{ textAlign: 'right' }}>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={!canWrite}
                  loading={updating}
                  onClick={handleAddArticle}
                >
                  {noteVisibility === 0 ? 'Add Internal Note' : 'Send Customer Article'}
                </Button>
              </div>
            </Space>
          </Card>

          <Divider style={{ margin: '4px 0' }}>Article History ({ticket?.articles?.length || 0})</Divider>

          {ticket?.articles?.length ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {ticket.articles.map((art) => {
                const isPublic = Number(art.isVisibleForCustomer) === 1;
                return (
                  <div
                    key={art.articleId}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 8,
                      background: isPublic ? '#ffffff' : '#fffbeb',
                      border: `1px solid ${isPublic ? '#e2e8f0' : '#fde68a'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <Space size={8}>
                        <Text strong>{art.from || art.senderType}</Text>
                        <Tag color={isPublic ? 'blue' : 'gold'} icon={isPublic ? <GlobalOutlined /> : <LockOutlined />}>
                          {isPublic ? 'Customer Visible' : 'Internal Note'}
                        </Tag>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(art.created)}
                      </Text>
                    </div>
                    {art.subject && (
                      <div style={{ fontWeight: 600, marginTop: 6, color: '#1e293b' }}>{art.subject}</div>
                    )}
                    <Paragraph
                      style={{
                        marginTop: 6,
                        marginBottom: art.attachments?.length ? 8 : 0,
                        whiteSpace: 'pre-wrap',
                        color: '#334155',
                      }}
                    >
                      {art.body}
                    </Paragraph>
                    {art.attachments?.length > 0 && (
                      <Space wrap>
                        {art.attachments.map((att) => (
                          <Button
                            key={att.attachmentId}
                            size="small"
                            icon={<PaperClipOutlined />}
                            onClick={() => handleDownload(art.articleId, att)}
                          >
                            {att.filename} ({att.filesize || 'file'})
                          </Button>
                        ))}
                      </Space>
                    )}
                  </div>
                );
              })}
            </Space>
          ) : (
            <Empty description="No articles recorded on this ticket" />
          )}
        </Space>
      ),
    },
    {
      key: 'history',
      label: (
        <span>
          <HistoryOutlined /> Znuny Event History ({ticket?.history?.length || 0})
        </span>
      ),
      children: ticket?.history?.length ? (
        <Timeline
          style={{ marginTop: 12 }}
          items={ticket.history.map((h, idx) => ({
            key: idx,
            color: 'blue',
            children: (
              <div>
                <Space size={8}>
                  <Tag color="geekblue">{h.action}</Tag>
                  <Text strong>{h.actor}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(h.timestamp)}
                  </Text>
                </Space>
                <div style={{ color: '#475569', fontSize: 12.5, marginTop: 2 }}>{h.detail}</div>
              </div>
            ),
          }))}
        />
      ) : (
        <Empty description="No Znuny history events returned" />
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      width={900}
      onClose={onClose}
      title={
        ticket ? (
          <div>
            <Space size={8} wrap>
              <span className="mono-code" style={{ color: '#2563eb', fontWeight: 700 }}>
                #{ticket.ticketNumber}
              </span>
              <Tag color={getTicketStateColor(ticket.state)}>{ticket.state}</Tag>
              <Tag color={getPriorityColor(ticket.priority)}>{ticket.priority}</Tag>
              <Tag color={slaMeta.color}>{slaMeta.label}</Tag>
            </Space>
            <Title level={5} style={{ margin: '4px 0 0 0' }}>
              {ticket.title}
            </Title>
          </div>
        ) : (
          'Ticket Details'
        )
      }
    >
      {loading || !ticket ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" tip="Loading ticket & article history from Znuny..." />
        </div>
      ) : (
        <Tabs items={tabItems} />
      )}
    </Drawer>
  );
}
