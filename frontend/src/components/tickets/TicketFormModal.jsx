import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Row, Col, Radio, Divider } from 'antd';

const { TextArea } = Input;

export default function TicketFormModal({
  open,
  catalogs,
  ciOptions = [],
  submitting = false,
  defaultLinkedCiId = null,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        queue: catalogs?.queues?.[0]?.name || 'Server',
        priority: '3 Major',
        state: 'open',
        isVisibleForCustomer: 0,
        linkedCiIds: defaultLinkedCiId ? [Number(defaultLinkedCiId)] : [],
      });
    }
  }, [open, catalogs, defaultLinkedCiId, form]);

  const handleFinish = (values) => {
    onSubmit({
      title: values.title,
      queue: values.queue,
      priority: values.priority,
      state: values.state,
      customer: values.customer,
      customerUser: values.customerUser,
      owner: values.owner,
      responsible: values.responsible,
      service: values.service,
      sla: values.sla,
      linkedCiIds: values.linkedCiIds || [],
      article: {
        subject: values.articleSubject || values.title,
        body: values.articleBody,
        isVisibleForCustomer: Number(values.isVisibleForCustomer) === 1,
      },
    });
  };

  return (
    <Modal
      open={open}
      width={760}
      title="Create Operations Ticket"
      okText="Create Ticket in Znuny"
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="title"
          label="Subject / Incident Summary"
          rules={[{ required: true, message: 'Ticket subject is required' }]}
        >
          <Input placeholder="e.g. Optical Rx Loss on Top Plaza Distribution Uplink" />
        </Form.Item>

        <Row gutter={14}>
          <Col xs={24} md={8}>
            <Form.Item name="queue" label="Queue" rules={[{ required: true }]}>
              <Select
                showSearch
                options={(catalogs?.queues || []).map((q) => ({ label: q.name, value: q.name }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
              <Select
                options={(catalogs?.priorities || []).map((p) => ({ label: p.name, value: p.name }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="state" label="Initial State" rules={[{ required: true }]}>
              <Select
                options={(catalogs?.states || []).map((s) => ({ label: s, value: s }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={14}>
          <Col xs={12} md={6}>
            <Form.Item name="customer" label="Customer Organization">
              <Input placeholder="e.g. Servenah Cloud" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="customerUser" label="Customer Contact Email">
              <Input placeholder="ops@customer.co.ke" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="owner" label="Owner Agent">
              <Select
                allowClear
                showSearch
                placeholder="Assign Owner"
                options={(catalogs?.agents || []).map((a) => ({ label: a, value: a }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="responsible" label="Responsible Agent">
              <Select
                allowClear
                showSearch
                placeholder="Assign Responsible"
                options={(catalogs?.agents || []).map((a) => ({ label: a, value: a }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={14}>
          <Col xs={12} md={8}>
            <Form.Item name="service" label="ITSM Service">
              <Select
                allowClear
                showSearch
                placeholder="Select Service"
                options={(catalogs?.services || []).map((s) => ({ label: s.name, value: s.name }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="sla" label="SLA Target">
              <Select
                allowClear
                showSearch
                placeholder="Select SLA"
                options={(catalogs?.slas || []).map((s) => ({
                  label: `${s.name}${s.solutionTime ? ` (${s.solutionTime}m)` : ''}`,
                  value: s.name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="linkedCiIds" label="Affected Infrastructure CIs">
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Associate CMDB CIs..."
                options={ciOptions}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider style={{ margin: '6px 0 14px' }}>Initial Ticket Article</Divider>

        <Form.Item name="isVisibleForCustomer" label="Article Visibility">
          <Radio.Group>
            <Radio.Button value={0}>Internal Operations Note (Agents Only)</Radio.Button>
            <Radio.Button value={1}>Customer-Visible Article</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="articleBody"
          label="Technical Details / Description"
          rules={[{ required: true, message: 'Initial article body is required by Znuny TicketCreate' }]}
        >
          <TextArea rows={4} placeholder="Describe symptoms, telemetry alerts, and triage steps..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
