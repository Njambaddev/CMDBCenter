import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  AutoComplete,
  InputNumber,
  Button,
  Row,
  Col,
  Divider,
  Alert,
  Tag,
  Space,
  Typography,
  Tabs,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

const SECTION_LABELS = {
  general: 'General & Lifecycle',
  hardware: 'Hardware & Specs',
  network: 'Network & Addressing',
  ownership: 'Ownership & Licensing',
  location: 'Site & Location',
};

const DEFAULT_ATLANCIS_LOCATIONS = [
  'Athi OCP Infra Inventory',
  'IX Africa',
  'Africa Data Center (ADC)',
  'Main Office, Top plaza',
];

export default function DynamicCIFormModal({
  open,
  mode = 'create', // 'create' | 'edit'
  initialCI = null,
  preselectedClass = null,
  knownLocations = [],
  schemasMeta,
  submitting = false,
  onCancel,
  onSubmit,
  onOpenClassCreator,
}) {
  const [form] = Form.useForm();
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('Servers');
  const [activeClassName, setActiveClassName] = useState('Servers');

  const classes = schemasMeta?.classes || {};
  const templates = schemasMeta?.templates || [];
  const deploymentStates = schemasMeta?.deploymentStates || [];
  const incidentStates = schemasMeta?.incidentStates || [];

  const locationSuggestions = useMemo(() => {
    const set = new Set([
      ...DEFAULT_ATLANCIS_LOCATIONS,
      ...(knownLocations || []).filter((l) => l && l !== 'Unassigned Location' && l !== '—'),
    ]);
    return Array.from(set).map((value) => ({ value, label: value }));
  }, [knownLocations]);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.key === selectedTemplateKey) || null,
    [templates, selectedTemplateKey]
  );

  const activeSchema = classes[activeClassName] || null;

  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && initialCI) {
      setActiveClassName(initialCI.className);
      setSelectedTemplateKey(initialCI.className);

      const flatAttrs = {};
      for (const [k, v] of Object.entries(initialCI.attributes || {})) {
        flatAttrs[k.replace(/\./g, '__')] = v;
      }

      form.setFieldsValue({
        name: initialCI.name,
        deplState: initialCI.deplState || 'Production',
        inciState: initialCI.inciState || 'Operational',
        changeNote: '',
        ...flatAttrs,
      });
    } else if (preselectedClass && classes[preselectedClass]) {
      const matchingTpl = templates.find((t) => t.key === preselectedClass || t.targetClass === preselectedClass);
      setSelectedTemplateKey(matchingTpl ? matchingTpl.key : preselectedClass);
      setActiveClassName(preselectedClass);
      form.resetFields();
      form.setFieldsValue({
        deplState: 'Production',
        inciState: 'Operational',
        ...(matchingTpl?.defaults || {}),
      });
    } else {
      const defaultTpl = templates[0] || { key: 'Servers', targetClass: 'Servers', defaults: {} };
      setSelectedTemplateKey(defaultTpl.key);
      setActiveClassName(defaultTpl.targetClass);
      form.resetFields();
      form.setFieldsValue({
        deplState: 'Production',
        inciState: 'Operational',
        ...(defaultTpl.defaults || {}),
      });
    }
  }, [open, mode, initialCI, preselectedClass, classes, templates, form]);

  const handleTemplateChange = (tplKey) => {
    setSelectedTemplateKey(tplKey);
    const tpl = templates.find((t) => t.key === tplKey);
    if (tpl) {
      setActiveClassName(tpl.targetClass);
      const currentName = form.getFieldValue('name');
      form.resetFields();
      form.setFieldsValue({
        name: currentName,
        deplState: 'Production',
        inciState: 'Operational',
        ...(tpl.defaults || {}),
      });
    } else if (classes[tplKey]) {
      setActiveClassName(tplKey);
      const currentName = form.getFieldValue('name');
      form.resetFields();
      form.setFieldsValue({
        name: currentName,
        deplState: 'Production',
        inciState: 'Operational',
      });
    }
  };

  const renderFieldInput = (field) => {
    if (field.type === 'GeneralCatalog' || Array.isArray(field.options)) {
      return (
        <Select
          allowClear
          showSearch
          placeholder={`Select ${field.label}`}
          options={(field.options || []).map((opt) => ({ label: opt, value: opt }))}
        />
      );
    }
    if (field.type === 'Integer') {
      return <InputNumber style={{ width: '100%' }} min={field.min ?? 0} max={field.max ?? 999999} />;
    }
    if (field.type === 'TextArea') {
      return <TextArea rows={2} placeholder={field.placeholder || `Enter ${field.label}`} />;
    }
    if (field.type === 'Date') {
      return <Input type="date" />;
    }
    if (field.type === 'DateTime') {
      return <Input placeholder="YYYY-MM-DD HH:MM:SS" />;
    }
    if (/^(site|location|address)$/i.test(field.key)) {
      return (
        <AutoComplete
          options={locationSuggestions}
          placeholder={field.placeholder || 'Select or type Location / Site'}
          filterOption={(inputValue, option) =>
            String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
          }
        />
      );
    }
    return <Input placeholder={field.placeholder || `Enter ${field.label}`} maxLength={field.maxLength || 250} />;
  };

  // Group schema fields (plus any subFields) by logical section
  const groupedSections = useMemo(() => {
    if (!activeSchema) return {};
    const groups = {};
    for (const field of activeSchema.fields || []) {
      const sec = field.section || 'general';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push({ ...field, formKey: field.key });

      if (Array.isArray(field.subFields)) {
        for (const sub of field.subFields) {
          groups[sec].push({
            ...sub,
            label: `${field.label} — ${sub.label}`,
            formKey: `${field.key}__${sub.key}`,
          });
        }
      }
    }
    return groups;
  }, [activeSchema]);

  const handleFinish = (values) => {
    const { name, deplState, inciState, changeNote, ...rawAttributes } = values;
    const attributes = {};
    for (const [k, v] of Object.entries(rawAttributes)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        attributes[k.replace(/__/g, '.')] = v;
      }
    }

    onSubmit({
      className: activeClassName,
      name: String(name || '').trim(),
      deplState,
      inciState,
      changeNote,
      attributes,
    });
  };

  // Build combined selector options: Custom Classes + Guided Templates + All Znuny Classes
  const selectorOptions = useMemo(() => {
    const customGroup = Object.values(classes)
      .filter((c) => c.origin && c.origin !== 'builtin')
      .map((c) => ({
        label: `${c.displayLabel || c.name} (Custom Znuny Class: ${c.name})`,
        value: c.name,
      }));

    const customNames = new Set(customGroup.map((c) => c.value));
    const templateGroup = templates
      .filter((t) => !customNames.has(t.key))
      .map((t) => ({
        label: `${t.label} (Znuny Class: ${t.targetClass})`,
        value: t.key,
      }));

    const coveredClasses = new Set([...templates.map((t) => t.key), ...customNames]);
    const extraClasses = Object.values(classes)
      .filter((c) => !coveredClasses.has(c.name))
      .map((c) => ({
        label: `${c.displayLabel} (Class: ${c.name})`,
        value: c.name,
      }));

    return [
      ...(customGroup.length > 0 ? [{ label: 'Custom / Synced Znuny Classes', options: customGroup }] : []),
      { label: 'Guided Infrastructure Templates', options: templateGroup },
      ...(extraClasses.length > 0 ? [{ label: 'Additional Znuny Component Classes', options: extraClasses }] : []),
    ];
  }, [templates, classes]);

  const sectionTabItems = Object.entries(groupedSections).map(([secKey, fields]) => ({
    key: secKey,
    label: `${SECTION_LABELS[secKey] || secKey} (${fields.length})`,
    forceRender: true,
    children: (
      <Row gutter={16}>
        {fields.map((f) => (
          <Col xs={24} md={f.type === 'TextArea' ? 24 : 12} key={f.formKey}>
            <Form.Item
              name={f.formKey}
              label={f.label}
              rules={f.required ? [{ required: true, message: `${f.label} is required` }] : []}
            >
              {renderFieldInput(f)}
            </Form.Item>
          </Col>
        ))}
      </Row>
    ),
  }));

  return (
    <Modal
      open={open}
      width={840}
      title={
        <Space>
          <span>{mode === 'edit' ? `Edit Configuration Item #${initialCI?.ciNumber}` : 'Create Configuration Item in Znuny'}</span>
          {activeClassName && <Tag color="blue">{activeClassName}</Tag>}
        </Space>
      }
      okText={mode === 'edit' ? 'Save CI Changes to Znuny' : 'Create CI in Znuny'}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      {mode === 'create' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text strong>1. Select Infrastructure Template / Znuny CI Class</Text>
            {onOpenClassCreator && (
              <Button size="small" type="link" icon={<PlusOutlined />} onClick={onOpenClassCreator}>
                Create New Class in Znuny
              </Button>
            )}
          </div>
          <Select
            style={{ width: '100%' }}
            size="large"
            showSearch
            value={selectedTemplateKey}
            onChange={handleTemplateChange}
            options={selectorOptions}
          />
          {activeTemplate?.description && (
            <Alert
              style={{ marginTop: 10 }}
              type="info"
              showIcon
              message={activeTemplate.description}
            />
          )}
        </div>
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Form.Item
              name="name"
              label="Configuration Item Name"
              rules={[{ required: true, message: 'CI Name is required' }]}
            >
              <Input placeholder="e.g. IX-EDGE-RTR01 or ATHI-OCP-SRV-NODE05" />
            </Form.Item>
          </Col>
          <Col xs={12} md={7}>
            <Form.Item
              name="deplState"
              label="Deployment State"
              rules={[{ required: true, message: 'Select deployment state' }]}
            >
              <Select options={deploymentStates.map((d) => ({ label: d.name, value: d.name }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={7}>
            <Form.Item
              name="inciState"
              label="Incident State"
              rules={[{ required: true, message: 'Select incident state' }]}
            >
              <Select options={incidentStates.map((i) => ({ label: i.name, value: i.name }))} />
            </Form.Item>
          </Col>
        </Row>

        <Divider style={{ margin: '8px 0 14px' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Class-Specific Znuny CIXMLData Attributes ({activeSchema?.displayLabel || activeClassName})
          </Text>
        </Divider>

        {sectionTabItems.length > 0 && <Tabs items={sectionTabItems} size="small" />}

        {mode === 'edit' && (
          <Form.Item name="changeNote" label="Audit / Version Change Note" style={{ marginTop: 8 }}>
            <Input placeholder="Brief reason for configuration update (recorded in Audit Log)" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
