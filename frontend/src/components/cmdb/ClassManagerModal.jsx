import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Tabs,
  Form,
  Input,
  Select,
  Button,
  Space,
  Table,
  Tag,
  Checkbox,
  Row,
  Col,
  Alert,
  Card,
  Switch,
  Typography,
  Tooltip,
  Divider,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SyncOutlined,
  CodeOutlined,
  DatabaseOutlined,
  EditOutlined,
  LockOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { cmdbApi } from '../../api/cmdbApi';

const { Text } = Typography;
const { TextArea } = Input;

const CATEGORY_OPTIONS = [
  'Compute & Blades',
  'Network Infrastructure',
  'Power & Facilities',
  'Storage',
  'Software & Licences',
  'ITSM Standard Assets',
  'Custom Infrastructure',
].map((v) => ({ label: v, value: v }));

const FIELD_TYPE_OPTIONS = [
  { label: 'Text (Single Line)', value: 'Text' },
  { label: 'TextArea (Multi-line)', value: 'TextArea' },
  { label: 'Integer (Numeric)', value: 'Integer' },
  { label: 'Date (YYYY-MM-DD)', value: 'Date' },
  { label: 'DateTime (Timestamp)', value: 'DateTime' },
  { label: 'GeneralCatalog (Dropdown)', value: 'GeneralCatalog' },
  { label: 'Customer User', value: 'Customer' },
  { label: 'Customer Company', value: 'CustomerCompany' },
];

const SECTION_OPTIONS = [
  { label: 'General & Lifecycle', value: 'general' },
  { label: 'Hardware & Specs', value: 'hardware' },
  { label: 'Network & Addressing', value: 'network' },
  { label: 'Site & Location', value: 'location' },
  { label: 'Ownership & Warranty', value: 'ownership' },
];

const CLASS_PRESETS = {
  blank: {
    label: 'Blank Custom Class',
    name: '',
    displayLabel: '',
    category: 'Custom Infrastructure',
    fields: [
      { key: 'hostname', label: 'Hostname / Asset Tag', type: 'Text', section: 'general', required: true, searchable: true },
      { key: 'vendor', label: 'Vendor / Manufacturer', type: 'Text', section: 'hardware', required: false, searchable: true },
      { key: 'model', label: 'Model', type: 'Text', section: 'hardware', required: false, searchable: true },
      { key: 'serial_number', label: 'Serial Number', type: 'Text', section: 'hardware', required: false, searchable: true },
      { key: 'site', label: 'Location / Site', type: 'Text', section: 'location', required: false, searchable: true },
      { key: 'notes', label: 'Notes', type: 'TextArea', section: 'general', required: false, searchable: false },
    ],
  },
  router: {
    label: 'Router / Edge Appliance',
    name: 'Routers',
    displayLabel: 'Router / WAN Edge',
    category: 'Network Infrastructure',
    fields: [
      { key: 'hostname', label: 'Router Hostname', type: 'Text', section: 'general', required: true, searchable: true },
      { key: 'mgmt_ip', label: 'Management IP', type: 'Text', section: 'network', required: true, searchable: true },
      { key: 'loopback_ip', label: 'Loopback IP', type: 'Text', section: 'network', required: false, searchable: true },
      { key: 'vendor', label: 'Vendor', type: 'Text', section: 'hardware', required: true, searchable: true },
      { key: 'model', label: 'Model', type: 'Text', section: 'hardware', required: true, searchable: true },
      { key: 'serial_number', label: 'Serial Number', type: 'Text', section: 'hardware', required: true, searchable: true },
      { key: 'os_version', label: 'OS / Firmware Version', type: 'Text', section: 'hardware', required: false, searchable: false },
      { key: 'device_role', label: 'Role (Core / PE / CE / BGP)', type: 'Text', section: 'general', required: false, searchable: true },
      { key: 'site', label: 'Location / Site', type: 'Text', section: 'location', required: true, searchable: true },
      { key: 'warranty_end', label: 'Warranty End Date', type: 'Date', section: 'ownership', required: false, searchable: true },
    ],
  },
  vm: {
    label: 'Virtual Machine',
    name: 'Virtual Machines',
    displayLabel: 'Virtual Machine (VM)',
    category: 'Compute & Blades',
    fields: [
      { key: 'hostname', label: 'VM Hostname / FQDN', type: 'Text', section: 'general', required: true, searchable: true },
      { key: 'ip_address', label: 'Primary IP Address', type: 'Text', section: 'network', required: true, searchable: true },
      { key: 'hypervisor_host', label: 'Hypervisor / Cluster Node', type: 'Text', section: 'hardware', required: false, searchable: true },
      { key: 'vcpu', label: 'vCPU Cores', type: 'Integer', section: 'hardware', required: false, searchable: false },
      { key: 'ram_gb', label: 'Memory (GB)', type: 'Integer', section: 'hardware', required: false, searchable: false },
      { key: 'disk_gb', label: 'Storage (GB)', type: 'Integer', section: 'hardware', required: false, searchable: false },
      { key: 'os_name', label: 'Operating System', type: 'Text', section: 'general', required: false, searchable: true },
      { key: 'site', label: 'Location / Site', type: 'Text', section: 'location', required: true, searchable: true },
      { key: 'owner', label: 'Service / Tenant Owner', type: 'Text', section: 'ownership', required: false, searchable: true },
    ],
  },
  ups: {
    label: 'UPS / Power Backup',
    name: 'UPS',
    displayLabel: 'UPS / Power System',
    category: 'Power & Facilities',
    fields: [
      { key: 'name', label: 'UPS Identifier', type: 'Text', section: 'general', required: true, searchable: true },
      { key: 'mgmt_ip', label: 'SNMP / Management IP', type: 'Text', section: 'network', required: false, searchable: true },
      { key: 'vendor', label: 'Manufacturer', type: 'Text', section: 'hardware', required: true, searchable: true },
      { key: 'model', label: 'Model', type: 'Text', section: 'hardware', required: true, searchable: true },
      { key: 'serial_number', label: 'Serial Number', type: 'Text', section: 'hardware', required: true, searchable: true },
      { key: 'capacity_kva', label: 'Capacity (kVA)', type: 'Integer', section: 'hardware', required: false, searchable: false },
      { key: 'site', label: 'Location / Site', type: 'Text', section: 'location', required: true, searchable: true },
      { key: 'next_maintenance_due', label: 'Next Maintenance Date', type: 'Date', section: 'ownership', required: false, searchable: true },
    ],
  },
  rack: {
    label: 'Rack / Cabinet',
    name: 'Racks',
    displayLabel: 'Server / Network Rack',
    category: 'Power & Facilities',
    fields: [
      { key: 'rack_code', label: 'Rack Code / Row-Unit', type: 'Text', section: 'general', required: true, searchable: true },
      { key: 'u_height', label: 'Rack Height (U)', type: 'Integer', section: 'hardware', required: false, searchable: false },
      { key: 'power_feed_kw', label: 'Rated Power (kW)', type: 'Text', section: 'hardware', required: false, searchable: false },
      { key: 'site', label: 'Data Center / Site', type: 'Text', section: 'location', required: true, searchable: true },
      { key: 'owner', label: 'Assigned Tenant / Team', type: 'Text', section: 'ownership', required: false, searchable: true },
    ],
  },
};

function slugifyKey(label = '') {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'attr_$1')
    .slice(0, 48);
}

function buildLocalYamlPreview(fields = []) {
  const lines = ['---'];
  for (const f of fields) {
    if (!f.key) continue;
    lines.push(`- Key: ${f.key}`);
    lines.push(`  Name: '${String(f.label || f.key).replace(/'/g, "''")}'`);
    if (f.searchable) lines.push('  Searchable: 1');
    lines.push('  Input:');
    if (f.type === 'GeneralCatalog') {
      lines.push('    Type: GeneralCatalog');
      lines.push(`    Class: '${f.catalogClass || 'ITSM::ConfigItem::YesNo'}'`);
      lines.push('    Translation: 1');
    } else if (f.type === 'Integer') {
      lines.push('    Type: Integer');
      lines.push('    ValueMin: 0');
      lines.push('    ValueMax: 999999');
      lines.push('    ValueDefault: 0');
    } else if (f.type === 'Date' || f.type === 'DateTime') {
      lines.push(`    Type: ${f.type}`);
      lines.push('    YearPeriodPast: 20');
      lines.push('    YearPeriodFuture: 20');
    } else if (f.type === 'TextArea' || f.type === 'Customer' || f.type === 'CustomerCompany') {
      lines.push(`    Type: ${f.type}`);
    } else {
      lines.push('    Type: Text');
      lines.push('    Size: 50');
      lines.push(`    MaxLength: ${f.maxLength || 100}`);
    }
    if (f.required) {
      lines.push('    Required: 1');
      lines.push('  CountMin: 1');
      lines.push('  CountMax: 1');
      lines.push('  CountDefault: 1');
    }
  }
  return lines.join('\n');
}

export default function ClassManagerModal({
  open,
  schemasMeta,
  canWrite,
  onClose,
  onClassSaved,
  onCreateCIInClass,
}) {
  const [activeTab, setActiveTab] = useState('builder');
  const [editingExistingName, setEditingExistingName] = useState(null);
  const [form] = Form.useForm();
  const [fields, setFields] = useState(CLASS_PRESETS.blank.fields);
  const [useCustomYaml, setUseCustomYaml] = useState(false);
  const [customYaml, setCustomYaml] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [needsAdminPassword, setNeedsAdminPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [classSearch, setClassSearch] = useState('');

  const catalogClasses = useMemo(
    () => Object.keys(schemasMeta?.generalCatalogs || { 'ITSM::ConfigItem::YesNo': ['Yes', 'No'] }),
    [schemasMeta]
  );

  const allClassesList = useMemo(() => {
    const list = Object.values(schemasMeta?.classes || {});
    if (!classSearch.trim()) return list;
    const q = classSearch.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.displayLabel || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q)
    );
  }, [schemasMeta, classSearch]);

  useEffect(() => {
    if (!open) return;
    if (!editingExistingName) {
      form.setFieldsValue({
        name: '',
        displayLabel: '',
        category: 'Custom Infrastructure',
        permissionGroup: 'itsm-configitem',
        description: '',
      });
      setFields(CLASS_PRESETS.blank.fields);
      setUseCustomYaml(false);
    }
  }, [open, editingExistingName, form]);

  const yamlPreview = useMemo(() => buildLocalYamlPreview(fields), [fields]);

  const applyPreset = (presetKey) => {
    const p = CLASS_PRESETS[presetKey];
    if (!p) return;
    setEditingExistingName(null);
    form.setFieldsValue({
      name: p.name,
      displayLabel: p.displayLabel,
      category: p.category,
      permissionGroup: 'itsm-configitem',
    });
    setFields(p.fields.map((f) => ({ ...f })));
    setUseCustomYaml(false);
  };

  const handleLoadClassForEdit = (cls) => {
    setEditingExistingName(cls.name);
    form.setFieldsValue({
      name: cls.name,
      displayLabel: cls.displayLabel || cls.name,
      category: cls.category || 'Custom Infrastructure',
      permissionGroup: 'itsm-configitem',
      description: '',
    });
    setFields(
      (cls.fields || []).map((f) => ({
        key: f.key,
        label: f.label || f.key,
        type: f.type || 'Text',
        catalogClass: f.catalogClass || 'ITSM::ConfigItem::YesNo',
        section: f.section || 'general',
        required: Boolean(f.required),
        searchable: Boolean(f.searchable),
        maxLength: f.maxLength || 100,
      }))
    );
    if (cls.rawYaml) {
      setCustomYaml(cls.rawYaml);
    }
    setUseCustomYaml(false);
    setActiveTab('builder');
  };

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        key: `custom_attr_${prev.length + 1}`,
        label: '',
        type: 'Text',
        catalogClass: 'ITSM::ConfigItem::YesNo',
        section: 'general',
        required: false,
        searchable: true,
        keyTouched: false,
      },
    ]);
  };

  const updateFieldRow = (idx, patch) => {
    setFields((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        if (patch.label !== undefined && !row.keyTouched && !editingExistingName) {
          const autoKey = slugifyKey(patch.label);
          if (autoKey) next.key = autoKey;
        }
        return next;
      })
    );
  };

  const removeFieldRow = (idx) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitClass = async () => {
    try {
      const vals = await form.validateFields();
      const validFields = fields.filter((f) => f.key && String(f.key).trim() !== '');
      if (!useCustomYaml && validFields.length === 0) {
        message.error('Add at least one attribute field to the class definition.');
        return;
      }

      setSubmitting(true);
      const payload = {
        name: vals.name.trim(),
        displayLabel: (vals.displayLabel || vals.name).trim(),
        category: vals.category,
        permissionGroup: vals.permissionGroup || 'itsm-configitem',
        description: vals.description || '',
        fields: validFields.map((f) => ({
          key: String(f.key).trim(),
          label: String(f.label || f.key).trim(),
          type: f.type,
          ...(f.type === 'GeneralCatalog' ? { catalogClass: f.catalogClass || 'ITSM::ConfigItem::YesNo' } : {}),
          section: f.section || 'general',
          required: Boolean(f.required),
          searchable: Boolean(f.searchable),
          maxLength: f.maxLength || 100,
        })),
        ...(useCustomYaml && customYaml.trim() ? { rawYaml: customYaml } : {}),
        ...(adminPassword ? { adminPassword } : {}),
      };

      const res = editingExistingName
        ? await cmdbApi.updateClassSchema(editingExistingName, payload)
        : await cmdbApi.createClass(payload);

      message.success(
        editingExistingName
          ? `Published new schema version for Znuny Class "${res.classSchema.name}" (ClassID #${res.classSchema.classId})`
          : `Created CMDB Class "${res.classSchema.name}" in Znuny (ClassID #${res.classSchema.classId})`
      );
      setNeedsAdminPassword(false);
      setEditingExistingName(null);
      onClassSaved?.(res.schemas, res.classSchema);
    } catch (err) {
      if (err.code === 'ZNUNY_ADMIN_AUTH_REQUIRED') {
        setNeedsAdminPassword(true);
        message.warning('Enter your Znuny Agent password below once to authorize Admin Class changes in Znuny.');
      } else if (err.errorFields) {
        // Antd form validation
      } else {
        message.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncFromZnuny = async () => {
    setSyncing(true);
    try {
      const res = await cmdbApi.syncClasses(adminPassword ? { adminPassword } : {});
      setNeedsAdminPassword(false);
      onClassSaved?.(res.schemas, null);
      message.success(
        res.syncedCustomClasses.length > 0
          ? `Synced ${res.syncedCustomClasses.length} custom class(es) from Znuny: ${res.syncedCustomClasses.join(', ')}`
          : `Verified all ${res.totalZnunyClasses} Znuny CMDB classes are in sync`
      );
    } catch (err) {
      if (err.code === 'ZNUNY_ADMIN_AUTH_REQUIRED') {
        setNeedsAdminPassword(true);
        setActiveTab('builder');
        message.warning('Confirm your Znuny password once to sync Admin class definitions.');
      } else {
        message.error(err.message);
      }
    } finally {
      setSyncing(false);
    }
  };

  const builderTab = (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message={
          editingExistingName
            ? `Editing Znuny Class Definition: "${editingExistingName}" — saving publishes a new YAML Definition version in Znuny.`
            : 'Creates the class in Znuny GeneralCatalog (ITSM::ConfigItem::Class), assigns itsm-configitem permissions, and saves the YAML attribute schema to Znuny.'
        }
        action={
          editingExistingName ? (
            <Button
              size="small"
              onClick={() => {
                setEditingExistingName(null);
                applyPreset('blank');
              }}
            >
              Switch to New Class
            </Button>
          ) : null
        }
      />

      {!editingExistingName && (
        <div style={{ marginBottom: 14 }}>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
            <ThunderboltOutlined /> Quick Starter Templates:
          </Text>
          <Space size={6} wrap>
            {Object.entries(CLASS_PRESETS).map(([k, p]) => (
              <Button key={k} size="small" onClick={() => applyPreset(k)}>
                {p.label}
              </Button>
            ))}
          </Space>
        </div>
      )}

      {needsAdminPassword && (
        <Alert
          type="warning"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 14 }}
          message="Confirm Znuny Admin Session"
          description={
            <Space style={{ marginTop: 6 }} wrap>
              <Input.Password
                style={{ width: 280 }}
                placeholder="Enter your Znuny Agent password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onPressEnter={handleSubmitClass}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Used strictly on the backend once to authorize Znuny AdminGeneralCatalog &amp; AdminITSMConfigItem.
              </Text>
            </Space>
          }
        />
      )}

      <Form form={form} layout="vertical">
        <Row gutter={14}>
          <Col xs={24} md={7}>
            <Form.Item
              name="name"
              label="Znuny Class Name"
              rules={[{ required: true, message: 'Enter unique Znuny Class Name' }]}
            >
              <Input
                disabled={Boolean(editingExistingName)}
                placeholder="e.g. Routers, Virtual Machines, UPS"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={7}>
            <Form.Item name="displayLabel" label="Display Label">
              <Input placeholder="e.g. Edge Router / WAN Appliance" />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="category" label="Category" initialValue="Custom Infrastructure">
              <Select options={CATEGORY_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="permissionGroup" label="Znuny Permission Group" initialValue="itsm-configitem">
              <Select
                options={[
                  { label: 'itsm-configitem (Recommended)', value: 'itsm-configitem' },
                  { label: 'users', value: 'users' },
                  { label: 'admin', value: 'admin' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Divider style={{ margin: '6px 0 12px' }}>
        <Space>
          <span>Class Attributes (CIXMLData Schema)</span>
          <Tag color="purple">{fields.length} fields</Tag>
        </Space>
      </Divider>

      <div style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
        {fields.map((f, idx) => (
          <Row gutter={8} key={idx} align="middle" style={{ marginBottom: 8 }}>
            <Col xs={24} sm={5}>
              <Input
                size="small"
                placeholder="Field Label (e.g. Mgmt IP)"
                value={f.label}
                onChange={(e) => updateFieldRow(idx, { label: e.target.value })}
              />
            </Col>
            <Col xs={14} sm={4}>
              <Input
                size="small"
                className="mono-code"
                placeholder="xml_key"
                value={f.key}
                onChange={(e) => updateFieldRow(idx, { key: e.target.value, keyTouched: true })}
              />
            </Col>
            <Col xs={10} sm={5}>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={f.type}
                onChange={(v) => updateFieldRow(idx, { type: v })}
                options={FIELD_TYPE_OPTIONS}
              />
            </Col>
            {f.type === 'GeneralCatalog' ? (
              <Col xs={14} sm={5}>
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  showSearch
                  value={f.catalogClass || 'ITSM::ConfigItem::YesNo'}
                  onChange={(v) => updateFieldRow(idx, { catalogClass: v })}
                  options={catalogClasses.map((c) => ({ label: c.replace('ITSM::ConfigItem::', ''), value: c }))}
                />
              </Col>
            ) : (
              <Col xs={14} sm={5}>
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={f.section || 'general'}
                  onChange={(v) => updateFieldRow(idx, { section: v })}
                  options={SECTION_OPTIONS}
                />
              </Col>
            )}
            <Col xs={8} sm={4}>
              <Space size={8}>
                <Checkbox
                  checked={Boolean(f.required)}
                  onChange={(e) => updateFieldRow(idx, { required: e.target.checked })}
                >
                  <span style={{ fontSize: 12 }}>Req</span>
                </Checkbox>
                <Checkbox
                  checked={Boolean(f.searchable)}
                  onChange={(e) => updateFieldRow(idx, { searchable: e.target.checked })}
                >
                  <span style={{ fontSize: 12 }}>Search</span>
                </Checkbox>
              </Space>
            </Col>
            <Col xs={2} sm={1} style={{ textAlign: 'right' }}>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={fields.length <= 1}
                onClick={() => removeFieldRow(idx)}
              />
            </Col>
          </Row>
        ))}
      </div>

      <Space style={{ marginTop: 8, justifyContent: 'space-between', width: '100%' }} wrap>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddField}>
          Add Attribute Field
        </Button>
        <Space size={8}>
          <CodeOutlined style={{ color: '#64748b' }} />
          <Text style={{ fontSize: 12 }}>Custom Raw Znuny YAML</Text>
          <Switch
            size="small"
            checked={useCustomYaml}
            onChange={(checked) => {
              setUseCustomYaml(checked);
              if (checked && !customYaml.trim()) setCustomYaml(yamlPreview);
            }}
          />
        </Space>
      </Space>

      <Card
        size="small"
        style={{ marginTop: 12, background: '#0f172a', borderRadius: 8 }}
        styles={{ body: { padding: '10px 12px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ color: '#94a3b8', fontSize: 11.5 }}>
            Znuny 6.5 `configitem_definition` YAML {useCustomYaml ? '(Editable)' : '(Auto-Generated Preview)'}
          </Text>
        </div>
        {useCustomYaml ? (
          <TextArea
            rows={7}
            value={customYaml}
            onChange={(e) => setCustomYaml(e.target.value)}
            className="mono-code"
            style={{ background: '#1e293b', color: '#e2e8f0', borderColor: '#334155', fontSize: 12 }}
          />
        ) : (
          <pre
            className="mono-code"
            style={{
              margin: 0,
              maxHeight: 145,
              overflow: 'auto',
              color: '#e2e8f0',
              fontSize: 11.5,
              lineHeight: 1.45,
            }}
          >
            {yamlPreview}
          </pre>
        )}
      </Card>
    </div>
  );

  const directoryTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <Input.Search
          allowClear
          placeholder="Filter classes by name or category..."
          style={{ width: 280 }}
          value={classSearch}
          onChange={(e) => setClassSearch(e.target.value)}
        />
        <Space>
          <Button icon={<SyncOutlined spin={syncing} />} loading={syncing} onClick={handleSyncFromZnuny}>
            Sync Classes from Znuny
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingExistingName(null);
              applyPreset('blank');
              setActiveTab('builder');
            }}
          >
            New Class
          </Button>
        </Space>
      </div>

      <Table
        size="small"
        rowKey="name"
        pagination={{ pageSize: 8 }}
        dataSource={allClassesList}
        columns={[
          {
            title: 'Class ID',
            dataIndex: 'classId',
            width: 85,
            render: (id) => <span className="mono-code">{id ? `#${id}` : '—'}</span>,
          },
          {
            title: 'Znuny Class Name',
            dataIndex: 'name',
            render: (name, rec) => (
              <Space size={6}>
                <Text strong>{name}</Text>
                {rec.origin && rec.origin !== 'builtin' && <Tag color="purple">Custom</Tag>}
              </Space>
            ),
          },
          {
            title: 'Category',
            dataIndex: 'category',
            render: (c) => <Tag color="blue">{c}</Tag>,
          },
          {
            title: 'Attributes',
            width: 95,
            render: (_, rec) => <Tag>{(rec.fields || []).length} fields</Tag>,
          },
          {
            title: 'REST Route',
            dataIndex: 'wsRoutePrefix',
            width: 115,
            render: (r) => <span className="mono-code">{r || '/servers'}</span>,
          },
          {
            title: 'Actions',
            width: 205,
            render: (_, rec) => (
              <Space size={6}>
                <Tooltip title="Create a new Configuration Item in this class">
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<PlusOutlined />}
                    disabled={!canWrite}
                    onClick={() => {
                      onCreateCIInClass?.(rec.name);
                    }}
                  >
                    Create CI
                  </Button>
                </Tooltip>
                <Tooltip title="Edit fields & publish new YAML definition version in Znuny">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={!canWrite}
                    onClick={() => handleLoadClassForEdit(rec)}
                  >
                    Schema
                  </Button>
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <Modal
      open={open}
      width={940}
      title={
        <Space>
          <DatabaseOutlined style={{ color: '#2563eb' }} />
          <span>Znuny CMDB Class &amp; Schema Manager</span>
          <Tag color="geekblue">{Object.keys(schemasMeta?.classes || {}).length} Classes</Tag>
        </Space>
      }
      onCancel={onClose}
      footer={
        activeTab === 'builder' ? (
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={!canWrite}
              onClick={handleSubmitClass}
            >
              {editingExistingName
                ? `Publish Updated "${editingExistingName}" Schema to Znuny`
                : 'Create Class & Save Schema to Znuny'}
            </Button>
          </Space>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
      destroyOnClose={false}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'builder',
            label: editingExistingName ? `Edit Schema: ${editingExistingName}` : '1. Create / Edit Class in Znuny',
            children: builderTab,
          },
          {
            key: 'directory',
            label: `2. Registered Znuny Classes (${Object.keys(schemasMeta?.classes || {}).length})`,
            children: directoryTab,
          },
        ]}
      />
    </Modal>
  );
}
