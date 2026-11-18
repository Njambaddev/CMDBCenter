import React, { useState } from 'react';
import {
  Modal,
  Steps,
  Upload,
  Button,
  Select,
  Table,
  Tag,
  Alert,
  Space,
  Radio,
  Checkbox,
  Result,
  Typography,
  Row,
  Col,
  Form,
  Input,
  message,
} from 'antd';
import {
  InboxOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { parseSpreadsheetFile, exportRecordsToFile } from '../../utils/exportUtils';
import { cmdbApi } from '../../api/cmdbApi';

const { Dragger } = Upload;
const { Text } = Typography;

export function BulkImportModal({ open, schemasMeta, canWrite, onClose, onCompleted }) {
  const [step, setStep] = useState(0);
  const [defaultClass, setDefaultClass] = useState('Servers');
  const [parsing, setParsing] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState('skip');
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionReport, setExecutionReport] = useState(null);

  const classes = schemasMeta?.classes || {};

  const resetState = () => {
    setStep(0);
    setPreviewReport(null);
    setDuplicateStrategy('skip');
    setConfirmed(false);
    setExecutionReport(null);
  };

  const handleClose = () => {
    resetState();
    onClose?.();
  };

  const handleDownloadSampleTemplate = (format = 'xlsx') => {
    const schema = classes[defaultClass];
    const sampleRow = {
      Class: defaultClass,
      Name: `SAMPLE-${defaultClass.toUpperCase().replace(/\s+/g, '-')}-01`,
      DeplState: 'Production',
      InciState: 'Operational',
    };
    for (const f of (schema?.fields || []).slice(0, 8)) {
      sampleRow[f.key] = f.placeholder || '';
    }
    exportRecordsToFile([sampleRow], `cmdb-import-template-${defaultClass}`, format, 'Template');
  };

  const handleFileSelected = async (file) => {
    setParsing(true);
    try {
      const parsedRows = await parseSpreadsheetFile(file);
      if (!parsedRows.length) {
        message.warning('The uploaded file contains no data rows.');
        return false;
      }
      const report = await cmdbApi.previewBulk({
        defaultClassName: defaultClass,
        rows: parsedRows,
      });
      setPreviewReport(report);
      setConfirmed(false);
      setStep(1);
    } catch (err) {
      message.error(err.message);
    } finally {
      setParsing(false);
    }
    return false;
  };

  const handleExecute = async () => {
    if (!confirmed) {
      message.warning('Please check the confirmation box before executing bulk import.');
      return;
    }
    setExecuting(true);
    try {
      const res = await cmdbApi.executeBulkImport({
        rows: previewReport.rows,
        duplicateStrategy,
        confirmed: true,
      });
      setExecutionReport(res);
      setStep(2);
      onCompleted?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Modal
      open={open}
      width={940}
      title="Bulk CMDB Import & Validation Wizard"
      footer={null}
      onCancel={handleClose}
      destroyOnClose
    >
      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 20 }}
        items={[
          { title: 'Upload CSV / Excel' },
          { title: 'Preview & Duplicate Check' },
          { title: 'Import Report' },
        ]}
      />

      {step === 0 && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Safe Non-Destructive Bulk Import"
            description="Uploaded records are validated against class schemas, required fields, and existing Serial Numbers / CI Numbers before any changes are sent to Znuny. Existing CIs are never silently overwritten."
          />

          <Row gutter={16} align="middle">
            <Col xs={24} md={12}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Default CI Class (used if row omits `Class` column):
              </Text>
              <Select
                style={{ width: '100%' }}
                showSearch
                value={defaultClass}
                onChange={setDefaultClass}
                options={Object.values(classes).map((c) => ({
                  label: `${c.displayLabel} (${c.name})`,
                  value: c.name,
                }))}
              />
            </Col>
            <Col xs={24} md={12} style={{ marginTop: 22 }}>
              <Space wrap>
                <Button icon={<DownloadOutlined />} onClick={() => handleDownloadSampleTemplate('xlsx')}>
                  Download .XLSX Template
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => handleDownloadSampleTemplate('csv')}>
                  Download .CSV Template
                </Button>
              </Space>
            </Col>
          </Row>

          <Dragger
            accept=".csv,.xlsx,.xls"
            multiple={false}
            showUploadList={false}
            beforeUpload={handleFileSelected}
            disabled={parsing}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              {parsing ? 'Parsing and validating against CMDB...' : 'Click or drag a CSV or Excel (.xlsx) file here to preview'}
            </p>
            <p className="ant-upload-hint">
              Supports `Class`, `Name`, `DeplState`, `InciState`, `SerialNumber`/`serial_number`, and any class-specific attribute columns.
            </p>
          </Dragger>
        </Space>
      )}

      {step === 1 && previewReport && (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Row gutter={12}>
            <Col span={6}>
              <Alert type="info" message={`Total Rows: ${previewReport.summary.totalRows}`} />
            </Col>
            <Col span={6}>
              <Alert type="success" message={`Ready to Create: ${previewReport.summary.readyCount}`} />
            </Col>
            <Col span={6}>
              <Alert type="warning" message={`Duplicates Detected: ${previewReport.summary.duplicateCount}`} />
            </Col>
            <Col span={6}>
              <Alert type="error" message={`Invalid Rows: ${previewReport.summary.invalidCount}`} />
            </Col>
          </Row>

          {previewReport.summary.duplicateCount > 0 && (
            <div style={{ padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <Space direction="vertical" size={6}>
                <Text strong>
                  <ExclamationCircleOutlined style={{ color: '#d97706', marginRight: 6 }} />
                  Duplicate Handling Policy (Existing CIs are NEVER overwritten without explicit selection):
                </Text>
                <Radio.Group
                  value={duplicateStrategy}
                  onChange={(e) => setDuplicateStrategy(e.target.value)}
                >
                  <Radio value="skip">Skip existing CIs (Safe Default — create new CIs only)</Radio>
                  <Radio value="update_confirmed">Update matched existing CIs with uploaded values</Radio>
                </Radio.Group>
              </Space>
            </div>
          )}

          <Table
            size="small"
            rowKey="rowNumber"
            pagination={{ pageSize: 8 }}
            dataSource={previewReport.rows}
            columns={[
              { title: '#', dataIndex: 'rowNumber', width: 55 },
              {
                title: 'Validation',
                dataIndex: 'status',
                width: 120,
                render: (st) =>
                  st === 'ready' ? (
                    <Tag color="success">Ready</Tag>
                  ) : st === 'duplicate' ? (
                    <Tag color="warning">Duplicate</Tag>
                  ) : (
                    <Tag color="error">Invalid</Tag>
                  ),
              },
              { title: 'Class', dataIndex: 'className', width: 130 },
              { title: 'CI Name', dataIndex: 'name', width: 180 },
              { title: 'Serial / Identifier', dataIndex: 'serialNumber', width: 140 },
              {
                title: 'Findings / Notes',
                render: (_, r) => (
                  <div style={{ fontSize: 12 }}>
                    {r.errors?.map((e, i) => (
                      <div key={i} style={{ color: '#dc2626' }}>&bull; {e}</div>
                    ))}
                    {r.warnings?.map((w, i) => (
                      <div key={i} style={{ color: '#d97706' }}>&bull; {w}</div>
                    ))}
                    {!r.errors?.length && !r.warnings?.length && (
                      <span style={{ color: '#059669' }}>Validated against {r.className} schema</span>
                    )}
                  </div>
                ),
              },
            ]}
          />

          <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
            I have reviewed the validation preview above and confirm executing this bulk CMDB operation.
          </Checkbox>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <Button onClick={resetState}>Upload Different File</Button>
            <Space>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                type="primary"
                disabled={!confirmed || !canWrite || (previewReport.summary.readyCount === 0 && (duplicateStrategy === 'skip' || previewReport.summary.duplicateCount === 0))}
                loading={executing}
                onClick={handleExecute}
              >
                Execute Confirmed Import
              </Button>
            </Space>
          </div>
        </Space>
      )}

      {step === 2 && executionReport && (
        <div>
          <Result
            status={executionReport.summary.failedCount === 0 ? 'success' : 'warning'}
            icon={<CheckCircleOutlined />}
            title="Bulk CMDB Operation Completed"
            subTitle={`Created: ${executionReport.summary.createdCount} | Updated: ${executionReport.summary.updatedCount} | Skipped: ${executionReport.summary.skippedCount} | Failed: ${executionReport.summary.failedCount}`}
            extra={[
              <Button
                key="export"
                icon={<DownloadOutlined />}
                onClick={() => exportRecordsToFile(executionReport.results, 'cmdb-bulk-import-report', 'xlsx', 'ImportResults')}
              >
                Export Import Report (.xlsx)
              </Button>,
              <Button key="done" type="primary" onClick={handleClose}>
                Done
              </Button>,
            ]}
          />
          <Table
            size="small"
            rowKey="rowNumber"
            pagination={{ pageSize: 6 }}
            dataSource={executionReport.results}
            columns={[
              { title: 'Row', dataIndex: 'rowNumber', width: 65 },
              { title: 'CI Name', dataIndex: 'name' },
              {
                title: 'Outcome',
                dataIndex: 'outcome',
                width: 150,
                render: (o) => (
                  <Tag color={o === 'created' || o === 'updated' ? 'success' : o.startsWith('skipped') ? 'default' : 'error'}>
                    {o.toUpperCase()}
                  </Tag>
                ),
              },
              { title: 'CI # / Details', render: (_, r) => r.ciNumber ? `#${r.ciNumber}` : r.detail || '—' },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

export function BulkUpdateSelectedModal({
  open,
  selectedIds = [],
  schemasMeta,
  submitting,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm();
  const [confirmed, setConfirmed] = useState(false);

  const handleFinish = (values) => {
    if (!confirmed) {
      message.warning('Please confirm before updating multiple Configuration Items.');
      return;
    }
    const patch = {};
    if (values.deplState) patch.deplState = values.deplState;
    if (values.inciState) patch.inciState = values.inciState;
    if (values.changeNote) patch.changeNote = values.changeNote;
    const attributes = {};
    if (values.site) attributes.site = values.site;
    if (values.Owner) attributes.Owner = values.Owner;
    if (Object.keys(attributes).length > 0) patch.attributes = attributes;

    onSubmit({
      ids: selectedIds,
      patch,
      confirmed: true,
    });
  };

  return (
    <Modal
      open={open}
      title={`Bulk Update ${selectedIds.length} Selected Configuration Item(s)`}
      okText={`Update ${selectedIds.length} CIs`}
      okButtonProps={{ disabled: !confirmed }}
      confirmLoading={submitting}
      onCancel={() => {
        setConfirmed(false);
        form.resetFields();
        onCancel?.();
      }}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Alert
        style={{ marginBottom: 14 }}
        type="warning"
        showIcon
        message="Only fields you populate below will be modified across the selected Configuration Items."
      />
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="deplState" label="New Deployment State (Optional)">
          <Select
            allowClear
            placeholder="Keep current Deployment State"
            options={(schemasMeta?.deploymentStates || []).map((d) => ({ label: d.name, value: d.name }))}
          />
        </Form.Item>
        <Form.Item name="inciState" label="New Incident State (Optional)">
          <Select
            allowClear
            placeholder="Keep current Incident State"
            options={(schemasMeta?.incidentStates || []).map((i) => ({ label: i.name, value: i.name }))}
          />
        </Form.Item>
        <Form.Item name="changeNote" label="Audit Change Reason">
          <Input placeholder="e.g. Scheduled maintenance window transition" />
        </Form.Item>
        <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
          Confirm applying these updates to all {selectedIds.length} selected Configuration Items.
        </Checkbox>
      </Form>
    </Modal>
  );
}
