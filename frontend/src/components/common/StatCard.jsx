import React from 'react';
import { Card, Typography, Space } from 'antd';

const { Text } = Typography;

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  accentColor = '#2563eb',
  bgTint = '#eff6ff',
  onClick,
}) {
  return (
    <Card
      className="enterprise-card"
      hoverable={Boolean(onClick)}
      onClick={onClick}
      styles={{ body: { padding: '18px 20px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <Text style={{ fontSize: 12.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {title}
          </Text>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1.25, marginTop: 6 }}>
            {value ?? 0}
          </div>
          {subtitle && (
            <Space size={4} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</Text>
            </Space>
          )}
        </div>
        {icon && (
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: bgTint,
              color: accentColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
