import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Popover,
  Checkbox,
  Dropdown,
  Switch,
  Popconfirm,
  Tooltip,
  Typography,
  Alert,
  message,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  SettingOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  StopOutlined,
  SearchOutlined,
  EditFilled,
  AppstoreAddOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cmdbApi } from '../api/cmdbApi';
import { useAuth } from '../context/AuthContext';
import { exportRecordsToFile } from '../utils/exportUtils';
import { formatDateTime, getDeploymentColor, getIncidentColor } from '../utils/formatters';
import DynamicCIFormModal from '../components/cmdb/DynamicCIFormModal';
import ClassManagerModal from '../components/cmdb/ClassManagerModal';
import CIDetailDrawer from '../components/cmdb/CIDetailDrawer';
import { BulkImportModal, BulkUpdateSelectedModal } from '../components/cmdb/BulkCMDBModal';

const { Title, Text } = Typography;

const ALL_COLUMN_KEYS = [
  'ciNumber',
  'name',
  'className',
  'deplState',
  'inciState',
  'vendor',
  'model',
  'serialNumber',
  'location',
  'owner',
  'lastUpdated',
];

export default function CMDBInventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { canWriteEffective, modeVersion, user, system } = useAuth();

  const [schemasMeta, setSchemasMeta] = useState(null);
  const [inventory, setInventory] = useState({ items: [], total: 0, facets: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & table state
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [classFilter, setClassFilter] = useState(searchParams.get('className') || 'ALL');
  const [deplFilter, setDeplFilter] = useState(searchParams.get('deplState') || 'ALL');
  const [inciFilter, setInciFilter] = useState(searchParams.get('inciState') || 'ALL');
  const [locationFilter, setLocationFilter] = useState(searchParams.get('location') || 'ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [includeComponents, setIncludeComponents] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('lastUpdated');
  const [sortOrder, setSortOrder] = useState('descend');
  const [visibleColumns, setVisibleColumns] = useState(ALL_COLUMN_KEYS);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // Modals & Drawers
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [editingCI, setEditingCI] = useState(null);
  const [preselectedClass, setPreselectedClass] = useState(null);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [classManagerOpen, setClassManagerOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeCI, setActiveCI] = useState(null);

  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  useEffect(() => {
    cmdbApi.getSchemas().then(setSchemasMeta).catch(() => {});
  }, []);

  const fetchInventory = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError('');
      try {
        const res = await cmdbApi.list({
          search,
          className: classFilter,
          deplState: deplFilter,
          inciState: inciFilter,
          location: locationFilter,
          vendor: vendorFilter,
          includeComponents,
          page,
          pageSize,
          sortBy,
          sortOrder,
          refresh: forceRefresh,
        });
        setInventory(res);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [
      search,
      classFilter,
      deplFilter,
      inciFilter,
      locationFilter,
      vendorFilter,
      includeComponents,
      page,
      pageSize,
      sortBy,
      sortOrder,
    ]
  );

  useEffect(() => {
    fetchInventory(false);
  }, [fetchInventory, modeVersion]);

  const openCIDetail = useCallback(async (ciId) => {
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
  }, []);

  useEffect(() => {
    const openId = searchParams.get('openId');
    const urlLoc = searchParams.get('location');
    const urlCls = searchParams.get('className');
    const urlDepl = searchParams.get('deplState');
    const urlInci = searchParams.get('inciState');

    if (urlLoc) setLocationFilter(urlLoc);
    if (urlCls) setClassFilter(urlCls);
    if (urlDepl) setDeplFilter(urlDepl);
    if (urlInci) setInciFilter(urlInci);

    if (openId) {
      openCIDetail(openId);
      const next = new URLSearchParams(searchParams);
      next.delete('openId');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, openCIDetail]);

  const handleOpenCreate = (targetClass = null) => {
    setFormMode('create');
    setEditingCI(null);
    setPreselectedClass(typeof targetClass === 'string' ? targetClass : classFilter !== 'ALL' ? classFilter : null);
    setFormOpen(true);
  };

  const handleOpenEdit = async (record) => {
    try {
      const full = record.attributes ? record : await cmdbApi.getById(record.id);
      setEditingCI(full);
      setFormMode('edit');
      setFormOpen(true);
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleFormSubmit = async (payload) => {
    setSubmittingForm(true);
    try {
      if (formMode === 'edit' && editingCI) {
        await cmdbApi.update(editingCI.id, payload);
        message.success(`Updated CI #${editingCI.ciNumber} (${payload.name})`);
        if (detailOpen && activeCI?.id === editingCI.id) {
          openCIDetail(editingCI.id);
        }
      } else {
        const created = await cmdbApi.create(payload);
        message.success(`Created Configuration Item #${created.ciNumber} (${created.name})`);
      }
      setFormOpen(false);
      fetchInventory(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleRetireCI = async (ci) => {
    try {
      await cmdbApi.update(ci.id, {
        deplState: 'Retired',
        changeNote: 'Retired via ITSM Center',
      });
      message.success(`Configuration Item #${ci.ciNumber} transitioned to Retired`);
      if (detailOpen && activeCI?.id === ci.id) {
        openCIDetail(ci.id);
      }
      fetchInventory(false);
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleBulkUpdateSubmit = async (payload) => {
    setBulkUpdating(true);
    try {
      const res = await cmdbApi.executeBulkUpdate(payload);
      message.success(`Bulk update completed: ${res.succeeded} succeeded, ${res.failed} failed`);
      setBulkUpdateOpen(false);
      setSelectedRowKeys([]);
      fetchInventory(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const allFiltered = await cmdbApi.list({
        search,
        className: classFilter,
        deplState: deplFilter,
        inciState: inciFilter,
        location: locationFilter,
        vendor: vendorFilter,
        includeComponents,
        exportAll: 'true',
      });
      const flat = (allFiltered.items || []).map((item) => ({
        'CI Number': item.ciNumber,
        'Configuration Item Name': item.name,
        'CI Class': item.className,
        'Deployment State': item.deplState,
        'Incident State': item.inciState,
        Vendor: item.vendor,
        Model: item.model,
        'Serial Number': item.serialNumber,
        Location: item.location,
        Owner: item.owner,
        'IP / BMC': item.ipAddress,
        'Last Updated': item.lastUpdated,
      }));
      exportRecordsToFile(flat, 'atlancis-cmdb-inventory', format, 'CMDB Inventory');
      message.success(`Exported ${flat.length} CIs to .${format}`);
    } catch (err) {
      message.error(`Export failed: ${err.message}`);
    }
  };

  const allColumns = useMemo(
    () => [
      {
        key: 'ciNumber',
        title: 'CI Number',
        dataIndex: 'ciNumber',
        width: 135,
        sorter: true,
        render: (val, rec) => (
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 600 }}
            className="mono-code"
            onClick={() => openCIDetail(rec.id)}
          >
            #{val}
          </Button>
        ),
      },
      {
        key: 'name',
        title: 'Configuration Item Name',
        dataIndex: 'name',
        width: 230,
        sorter: true,
        render: (val, rec) => (
          <div>
            <a
              style={{ fontWeight: 600, color: '#0f172a' }}
              onClick={() => openCIDetail(rec.id)}
            >
              {val}
            </a>
            {rec.ipAddress && rec.ipAddress !== '—' && (
              <div className="mono-code" style={{ fontSize: 11.5, color: '#64748b' }}>
                {rec.ipAddress}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'className',
        title: 'CI Class',
        dataIndex: 'className',
        width: 150,
        sorter: true,
        render: (c) => <Tag color="blue">{c}</Tag>,
      },
      {
        key: 'deplState',
        title: 'Deployment State',
        dataIndex: 'deplState',
        width: 145,
        sorter: true,
        render: (s) => <Tag color={getDeploymentColor(s)}>{s}</Tag>,
      },
      {
        key: 'inciState',
        title: 'Incident State',
        dataIndex: 'inciState',
        width: 135,
        sorter: true,
        render: (s) => <Tag color={getIncidentColor(s)}>{s}</Tag>,
      },
      {
        key: 'vendor',
        title: 'Vendor',
        dataIndex: 'vendor',
        width: 135,
        sorter: true,
        ellipsis: true,
      },
      {
        key: 'model',
        title: 'Model',
        dataIndex: 'model',
        width: 175,
        sorter: true,
        ellipsis: true,
      },
      {
        key: 'serialNumber',
        title: 'Serial Number',
        dataIndex: 'serialNumber',
        width: 155,
        render: (s) => <span className="mono-code">{s}</span>,
      },
      {
        key: 'location',
        title: 'Location',
        dataIndex: 'location',
        width: 185,
        sorter: true,
        ellipsis: true,
        render: (loc) => {
          const displayLoc = !loc || loc === '—' ? 'Unassigned Location' : loc;
          return (
            <Tag
              icon={<EnvironmentOutlined />}
              color={!loc || loc === '—' ? 'default' : 'purple'}
              style={{ cursor: 'pointer', margin: 0 }}
              onClick={() => {
                setLocationFilter(displayLoc);
                setPage(1);
              }}
            >
              {displayLoc}
            </Tag>
          );
        },
      },
      {
        key: 'owner',
        title: 'Owner',
        dataIndex: 'owner',
        width: 145,
        sorter: true,
        ellipsis: true,
      },
      {
        key: 'lastUpdated',
        title: 'Last Updated',
        dataIndex: 'lastUpdated',
        width: 155,
        sorter: true,
        render: (d) => <span style={{ fontSize: 12.5 }}>{formatDateTime(d)}</span>,
      },
    ],
    [openCIDetail]
  );

  const displayedColumns = useMemo(() => {
    const filtered = allColumns.filter((c) => visibleColumns.includes(c.key));
    filtered.push({
      key: 'actions',
      title: 'Actions',
      fixed: 'right',
      width: 130,
      render: (_, rec) => (
        <Space size={4}>
          <Tooltip title="Inspect CI Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openCIDetail(rec.id)} />
          </Tooltip>
          <Tooltip title={canWriteEffective ? 'Edit CI' : 'Write Guard Active / Read-Only'}>
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={!canWriteEffective}
              onClick={() => handleOpenEdit(rec)}
            />
          </Tooltip>
          {rec.deplState !== 'Retired' && (
            <Popconfirm
              title={`Retire "${rec.name}"?`}
              okText="Retire"
              okButtonProps={{ danger: true }}
              disabled={!canWriteEffective}
              onConfirm={() => handleRetireCI(rec)}
            >
              <Tooltip title={canWriteEffective ? 'Retire CI' : 'Write Guard Active'}>
                <Button size="small" danger icon={<StopOutlined />} disabled={!canWriteEffective} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    });
    return filtered;
  }, [allColumns, visibleColumns, canWriteEffective, openCIDetail]);

  const facets = inventory.facets || {};

  const columnSelectorContent = (
    <div style={{ width: 230 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        Visible Table Columns
      </Text>
      <Checkbox.Group
        value={visibleColumns}
        onChange={(vals) => vals.length > 0 && setVisibleColumns(vals)}
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        options={allColumns.map((c) => ({ label: c.title, value: c.key }))}
      />
    </div>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="page-header-bar">
        <div>
          <Title level={3} className="page-title">
            CMDB Configuration Item Inventory
          </Title>
          <p className="page-subtitle">
            Unified asset lifecycle, class-specific CIXMLData inspection &amp; bulk management across 23 Znuny classes
          </p>
        </div>

        <Space wrap>
          {selectedRowKeys.length > 0 && (
            <Button
              icon={<EditFilled />}
              disabled={!canWriteEffective}
              onClick={() => setBulkUpdateOpen(true)}
            >
              Bulk Update ({selectedRowKeys.length})
            </Button>
          )}
          <Button icon={<UploadOutlined />} onClick={() => setBulkImportOpen(true)}>
            Bulk CSV/Excel Import
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', label: 'Export Filtered Inventory (.xlsx)', onClick: () => handleExport('xlsx') },
                { key: 'csv', label: 'Export Filtered Inventory (.csv)', onClick: () => handleExport('csv') },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />}>Export</Button>
          </Dropdown>
          <Popover content={columnSelectorContent} trigger="click" placement="bottomRight">
            <Button icon={<SettingOutlined />}>Columns</Button>
          </Popover>
          <Button
            icon={<AppstoreAddOutlined />}
            onClick={() => setClassManagerOpen(true)}
          >
            Manage / Create Class
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canWriteEffective}
            onClick={() => handleOpenCreate()}
          >
            Create CI
          </Button>
        </Space>
      </div>

      {user?.mode === 'live' && !system?.allowLiveWrites && (
        <Alert
          type="info"
          showIcon
          message="Live Read Mode Active — Write Protection Enabled"
          description="You are viewing real Configuration Items from Mysupport-Prod-App. To create, edit, retire, or bulk-import into live Znuny, enable 'Allow Live Writes' in Settings (or switch to Demo Mode in the top bar to test full CRUD workflows)."
        />
      )}

      {error && <Alert type="error" showIcon message={error} />}

      {/* Search & Multi-Facet Filter Bar */}
      <Card className="enterprise-card" styles={{ body: { padding: '14px 16px' } }}>
        <Space wrap size={[10, 10]} style={{ width: '100%' }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search CI Name, Number, Serial, Hostname, IP..."
            style={{ width: 290 }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <Select
            style={{ width: 185 }}
            showSearch
            value={classFilter}
            onChange={(v) => {
              setClassFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All CI Classes', value: 'ALL' },
              ...Object.keys(schemasMeta?.classes || {}).map((c) => ({ label: c, value: c })),
            ]}
          />

          <Select
            style={{ width: 165 }}
            value={deplFilter}
            onChange={(v) => {
              setDeplFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Deployment States', value: 'ALL' },
              ...(schemasMeta?.deploymentStates || []).map((d) => ({ label: d.name, value: d.name })),
            ]}
          />

          <Select
            style={{ width: 155 }}
            value={inciFilter}
            onChange={(v) => {
              setInciFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Incident States', value: 'ALL' },
              ...(schemasMeta?.incidentStates || []).map((i) => ({ label: i.name, value: i.name })),
            ]}
          />

          <Select
            style={{ width: 175 }}
            showSearch
            value={locationFilter}
            onChange={(v) => {
              setLocationFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Locations', value: 'ALL' },
              ...(facets.locations || []).map((l) => ({ label: l, value: l })),
            ]}
          />

          <Select
            style={{ width: 165 }}
            showSearch
            value={vendorFilter}
            onChange={(v) => {
              setVendorFilter(v);
              setPage(1);
            }}
            options={[
              { label: 'All Vendors', value: 'ALL' },
              ...(facets.vendors || []).map((v) => ({ label: v, value: v })),
            ]}
          />

          <Space size={6}>
            <Switch
              size="small"
              checked={includeComponents}
              onChange={(checked) => {
                setIncludeComponents(checked);
                setPage(1);
              }}
            />
            <Text style={{ fontSize: 12 }}>Sub-Components</Text>
          </Space>

          <Button icon={<ReloadOutlined />} onClick={() => fetchInventory(true)}>
            Refresh
          </Button>
        </Space>
      </Card>

      {/* Inventory Table */}
      <Card className="enterprise-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={inventory.items || []}
          columns={displayedColumns}
          scroll={{ x: 1550 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
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
            total: inventory.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (tot) => `${tot} Configuration Items`,
            style: { padding: '12px 18px', margin: 0 },
          }}
        />
      </Card>

      <DynamicCIFormModal
        open={formOpen}
        mode={formMode}
        initialCI={editingCI}
        preselectedClass={preselectedClass}
        knownLocations={facets.locations || []}
        schemasMeta={schemasMeta}
        submitting={submittingForm}
        onCancel={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        onOpenClassCreator={() => {
          setFormOpen(false);
          setClassManagerOpen(true);
        }}
      />

      <ClassManagerModal
        open={classManagerOpen}
        schemasMeta={schemasMeta}
        canWrite={canWriteEffective}
        onClose={() => setClassManagerOpen(false)}
        onClassSaved={(updatedSchemas, savedClass) => {
          if (updatedSchemas) setSchemasMeta(updatedSchemas);
          if (savedClass?.name) {
            setPreselectedClass(savedClass.name);
          }
        }}
        onCreateCIInClass={(targetClassName) => {
          setClassManagerOpen(false);
          handleOpenCreate(targetClassName);
        }}
      />

      <CIDetailDrawer
        open={detailOpen}
        loading={detailLoading}
        ci={activeCI}
        canWrite={canWriteEffective}
        onClose={() => setDetailOpen(false)}
        onEdit={(ci) => handleOpenEdit(ci)}
        onRetire={handleRetireCI}
        onInspectCI={(id) => openCIDetail(id)}
        onInspectTicket={(ticketId) => navigate(`/tickets?openTicketId=${ticketId}`)}
      />

      <BulkImportModal
        open={bulkImportOpen}
        schemasMeta={schemasMeta}
        canWrite={canWriteEffective}
        onClose={() => setBulkImportOpen(false)}
        onCompleted={() => fetchInventory(true)}
      />

      <BulkUpdateSelectedModal
        open={bulkUpdateOpen}
        selectedIds={selectedRowKeys}
        schemasMeta={schemasMeta}
        submitting={bulkUpdating}
        onCancel={() => setBulkUpdateOpen(false)}
        onSubmit={handleBulkUpdateSubmit}
      />
    </Space>
  );
}
