import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Dropdown,
  Alert,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DownloadOutlined,
  SearchOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ticketApi } from '../api/ticketApi';
import { cmdbApi } from '../api/cmdbApi';
import { useAuth } from '../context/AuthContext';
import { exportRecordsToFile } from '../utils/exportUtils';
import {
  formatDateTime,
  formatSlaCountdown,
  getPriorityColor,
  getSlaStatusMeta,
  getTicketStateColor,
} from '../utils/formatters';
import TicketFormModal from '../components/tickets/TicketFormModal';
import TicketDetailDrawer from '../components/tickets/TicketDetailDrawer';

const { Title } = Typography;

export default function TicketManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { canWriteEffective, modeVersion, user, system } = useAuth();

  const [catalogs, setCatalogs] = useState(null);
  const [ciOptions, setCiOptions] = useState([]);
  const [ticketData, setTicketData] = useState({ items: [], total: 0, facets: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & sorting
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || 'ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [queueFilter, setQueueFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('updated');
  const [sortOrder, setSortOrder] = useState('descend');

  // Create & Detail state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);

  useEffect(() => {
    ticketApi.getCatalogs().then(setCatalogs).catch(() => {});
    cmdbApi
      .list({ pageSize: 300 })
      .then((res) => {
        setCiOptions(
          (res.items || []).map((c) => ({
            label: `${c.name} (${c.className} • #${c.ciNumber})`,
            value: c.id,
          }))
        );
      })
      .catch(() => {});
  }, [modeVersion]);

  const fetchTickets = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError('');
      try {
        const res = await ticketApi.list({
          search,
          state: stateFilter,
          priority: priorityFilter,
          queue: queueFilter,
          customer: customerFilter,
          owner: ownerFilter,
          slaStatus: slaFilter,
          page,
          pageSize,
          sortBy,
          sortOrder,
          refresh: forceRefresh,
        });
        setTicketData(res);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [
      search,
      stateFilter,
      priorityFilter,
      queueFilter,
      customerFilter,
      ownerFilter,
      slaFilter,
      page,
      pageSize,
      sortBy,
      sortOrder,
    ]
  );

  useEffect(() => {
    fetchTickets(false);
  }, [fetchTickets, modeVersion]);

  const openTicket = useCallback(async (ticketId) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await ticketApi.getById(ticketId);
      setActiveTicket(full);
    } catch (err) {
      message.error(err.message);
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const openTicketId = searchParams.get('openTicketId');
    const openByNumber = searchParams.get('openId');
    if (openTicketId) {
      openTicket(openTicketId);
      const next = new URLSearchParams(searchParams);
      next.delete('openTicketId');
      setSearchParams(next, { replace: true });
    } else if (openByNumber && ticketData.items?.length) {
      const matched = ticketData.items.find((t) => String(t.ticketNumber) === String(openByNumber));
      if (matched) {
        openTicket(matched.id);
        const next = new URLSearchParams(searchParams);
        next.delete('openId');
        setSearchParams(next, { replace: true });
      }
    }
  }, [searchParams, setSearchParams, openTicket, ticketData.items]);

  const handleCreateTicket = async (payload) => {
    setCreating(true);
    try {
      const created = await ticketApi.create(payload);
      message.success(`Created Ticket #${created.ticketNumber}`);
      setCreateOpen(false);
      fetchTickets(true);
    } catch (err) {
      message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTicket = async (patchPayload) => {
    if (!activeTicket) return;
    setUpdatingTicket(true);
    try {
      const updated = await ticketApi.update(activeTicket.id, patchPayload);
      setActiveTicket(updated);
      message.success(`Updated Ticket #${updated.ticketNumber}`);
      fetchTickets(true);
    } catch (err) {
      message.error(err.message);
    } finally {
      setUpdatingTicket(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const all = await ticketApi.list({
        search,
        state: stateFilter,
        priority: priorityFilter,
        queue: queueFilter,
        customer: customerFilter,
        owner: ownerFilter,
        slaStatus: slaFilter,
        exportAll: 'true',
      });
      const flat = (all.items || []).map((t) => ({
        'Ticket Number': t.ticketNumber,
        Subject: t.title,
        Queue: t.queue,
        State: t.state,
        Priority: t.priority,
        Customer: t.customer,
        Owner: t.owner,
        'Responsible Agent': t.responsible,
        'SLA Policy': t.sla || '—',
        'SLA Status': getSlaStatusMeta(t.slaStatus).label,
        'Linked CIs': (t.linkedCIs || []).map((c) => c.name).join(', ') || '—',
        'Created Date': t.created,
        'Updated Date': t.updated,
      }));
      exportRecordsToFile(flat, 'atlancis-tickets', format, 'Tickets');
      message.success(`Exported ${flat.length} tickets to .${format}`);
    } catch (err) {
      message.error(err.message);
    }
  };

  const facets = ticketData.facets || {};

  const columns = useMemo(
    () => [
      {
        title: 'Ticket Number',
        dataIndex: 'ticketNumber',
        width: 155,
        sorter: true,
        render: (num, rec) => (
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 700 }}
            className="mono-code"
            onClick={() => openTicket(rec.id)}
          >
            #{num}
          </Button>
        ),
      },
      {
        title: 'Subject',
        dataIndex: 'title',
        width: 310,
        sorter: true,
        render: (title, rec) => (
          <div>
            <a style={{ fontWeight: 600, color: '#0f172a' }} onClick={() => openTicket(rec.id)}>
              {title}
            </a>
            {rec.linkedCIs?.length > 0 && (
              <div style={{ marginTop: 3 }}>
                {rec.linkedCIs.map((ci) => (
                  <Tag
                    key={ci.id}
                    icon={<DeploymentUnitOutlined />}
                    color="cyan"
                    style={{ fontSize: 11, cursor: 'pointer' }}
                    onClick={() => navigate(`/cmdb?openId=${ci.id}`)}
                  >
                    {ci.name}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'Queue',
        dataIndex: 'queue',
        width: 165,
        sorter: true,
        ellipsis: true,
      },
      {
        title: 'State',
        dataIndex: 'state',
        width: 135,
        sorter: true,
        render: (s) => <Tag color={getTicketStateColor(s)}>{s}</Tag>,
      },
      {
        title: 'Priority',
        dataIndex: 'priority',
        width: 120,
        sorter: true,
        render: (p) => <Tag color={getPriorityColor(p)}>{p}</Tag>,
      },
      {
        title: 'Customer',
        dataIndex: 'customer',
        width: 165,
        sorter: true,
        ellipsis: true,
      },
      {
        title: 'Owner',
        dataIndex: 'owner',
        width: 125,
        sorter: true,
      },
      {
        title: 'Responsible',
        dataIndex: 'responsible',
        width: 130,
        sorter: true,
      },
      {
        title: 'SLA Posture',
        dataIndex: 'slaStatus',
        width: 175,
        render: (status, rec) => {
          const meta = getSlaStatusMeta(status);
          return (
            <div>
              <Tag color={meta.color}>{meta.label}</Tag>
              {rec.escalationSecondsRemaining !== null && (
                <div style={{ fontSize: 11, color: rec.escalationSecondsRemaining < 0 ? '#dc2626' : '#64748b', marginTop: 2 }}>
                  {formatSlaCountdown(rec.escalationSecondsRemaining)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        title: 'Created Date',
        dataIndex: 'created',
        width: 150,
        sorter: true,
        render: (d) => <span style={{ fontSize: 12 }}>{formatDateTime(d)}</span>,
      },
      {
        title: 'Updated Date',
        dataIndex: 'updated',
        width: 150,
        sorter: true,
        render: (d) => <span style={{ fontSize: 12 }}>{formatDateTime(d)}</span>,
      },
    ],
    [openTicket, navigate]
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Title level={3} className="page-title">
            Service Desk &amp; Infrastructure Ticket Management
          </Title>
          <p className="page-subtitle">
            Incident triage, queue routing, SLA tracking, internal/customer articles &amp; CMDB CI impact linking
          </p>
        </div>
        <Space wrap>
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', label: 'Export Tickets (.xlsx)', onClick: () => handleExport('xlsx') },
                { key: 'csv', label: 'Export Tickets (.csv)', onClick: () => handleExport('csv') },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />}>Export</Button>
          </Dropdown>
          <Button icon={<ReloadOutlined />} onClick={() => fetchTickets(true)}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canWriteEffective}
            onClick={() => setCreateOpen(true)}
          >
            Create Ticket
          </Button>
        </Space>
      </div>

      {user?.mode === 'live' && !system?.allowLiveWrites && (
        <Alert
          type="info"
          showIcon
          message="Live Read Mode — Ticket Mutations Protected"
          description="Live Znuny tickets and SLA escalations are displayed in read-only mode while Write Guard is active. Enable 'Allow Live Writes' in Settings or switch to Demo Mode to test ticket creation, updates, and article replies."
        />
      )}

      {error && <Alert type="error" showIcon message={error} />}

      {/* Filter Bar */}
      <Card className="enterprise-card" styles={{ body: { padding: '14px 16px' } }}>
        <Space wrap size={[10, 10]}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search Ticket #, Subject, Customer, Agent..."
            style={{ width: 280 }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <Select
            style={{ width: 165 }}
            value={stateFilter}
            onChange={(v) => {
              setStateFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All States', value: 'ALL' },
              { label: 'Active (Non-Closed)', value: 'OPEN_ACTIVE' },
              ...(facets.states || []).map((s) => ({ label: s, value: s })),
            ]}
          />

          <Select
            style={{ width: 150 }}
            value={priorityFilter}
            onChange={(v) => {
              setPriorityFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Priorities', value: 'ALL' },
              ...(facets.priorities || []).map((p) => ({ label: p, value: p })),
            ]}
          />

          <Select
            style={{ width: 185 }}
            showSearch
            value={queueFilter}
            onChange={(v) => {
              setQueueFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Queues', value: 'ALL' },
              ...(facets.queues || []).map((q) => ({ label: q, value: q })),
            ]}
          />

          <Select
            style={{ width: 180 }}
            showSearch
            value={customerFilter}
            onChange={(v) => {
              setCustomerFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Customers', value: 'ALL' },
              ...(facets.customers || []).map((c) => ({ label: c, value: c })),
            ]}
          />

          <Select
            style={{ width: 160 }}
            showSearch
            value={ownerFilter}
            onChange={(v) => {
              setOwnerFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Owners', value: 'ALL' },
              ...(facets.owners || []).map((o) => ({ label: o, value: o })),
            ]}
          />

          <Select
            style={{ width: 170 }}
            value={slaFilter}
            onChange={(v) => {
              setSlaFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All SLA States', value: 'ALL' },
              { label: 'SLA Breached', value: 'breached' },
              { label: 'Approaching Breach', value: 'approaching_breach' },
              { label: 'Within SLA', value: 'within_sla' },
              { label: 'SLA Met', value: 'met' },
            ]}
          />
        </Space>
      </Card>

      <Card className="enterprise-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={ticketData.items || []}
          columns={columns}
          scroll={{ x: 1680 }}
          onChange={(pagination, _filters, sorter) => {
            setPage(pagination.current || 1);
            setPageSize(pagination.pageSize || 20);
            if (sorter && sorter.field) {
              setSortBy(sorter.field);
              setSortOrder(sorter.order || 'descend');
            }
          }}
          pagination={{
            current: page,
            pageSize,
            total: ticketData.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (tot) => `${tot} Tickets`,
            style: { padding: '12px 18px', margin: 0 },
          }}
        />
      </Card>

      <TicketFormModal
        open={createOpen}
        catalogs={catalogs}
        ciOptions={ciOptions}
        submitting={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreateTicket}
      />

      <TicketDetailDrawer
        open={detailOpen}
        loading={detailLoading}
        ticket={activeTicket}
        catalogs={catalogs}
        ciOptions={ciOptions}
        canWrite={canWriteEffective}
        updating={updatingTicket}
        onClose={() => setDetailOpen(false)}
        onUpdateTicket={handleUpdateTicket}
        onInspectCI={(ciId) => navigate(`/cmdb?openId=${ciId}`)}
      />
    </Space>
  );
}
