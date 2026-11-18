import React, { useMemo, useState } from 'react';
import { Card, Tag, Space, Select, Empty, Typography, Tooltip, Badge, Button } from 'antd';
import {
  CloudServerOutlined,
  ClusterOutlined,
  ApartmentOutlined,
  ThunderboltOutlined,
  SafetyOutlined,
  HddOutlined,
  AppstoreOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { getIncidentColor } from '../../utils/formatters';

const { Text } = Typography;

function getClassIcon(className = '') {
  const c = className.toLowerCase();
  if (c.includes('server') || c === 'computer') return <CloudServerOutlined />;
  if (c.includes('chassis')) return <ClusterOutlined />;
  if (c.includes('switch') || c.includes('network') || c === 'hardware') return <ApartmentOutlined />;
  if (c.includes('firewall')) return <SafetyOutlined />;
  if (c.includes('access point')) return <WifiOutlined />;
  if (c.includes('pdu') || c.includes('circuit') || c.includes('outlet')) return <ThunderboltOutlined />;
  if (c.includes('storage')) return <HddOutlined />;
  return <AppstoreOutlined />;
}

/**
 * Builds clean hierarchical dependency trees from directed graph edges (source -> target)
 * so operations teams can visually trace stacks like:
 * - PDU -> Circuit -> Chassis -> Physical Servers -> Virtual Machines -> Applications
 * - Core Switch -> Distribution Switch / Firewall / Router -> Access Points / Servers
 */
function buildDependencyTrees(nodes = [], edges = [], focusRootId = 'ALL') {
  const nodeMap = new Map(nodes.map((n) => [Number(n.id), n]));
  const childrenBySource = new Map();
  const incomingCount = new Map(nodes.map((n) => [Number(n.id), 0]));

  for (const edge of edges) {
    const s = Number(edge.sourceId);
    const t = Number(edge.targetId);
    if (!nodeMap.has(s) || !nodeMap.has(t)) continue;
    if (!childrenBySource.has(s)) childrenBySource.set(s, []);
    childrenBySource.get(s).push({
      edgeId: edge.id,
      linkType: edge.linkType,
      description: edge.description,
      targetNode: nodeMap.get(t),
    });
    incomingCount.set(t, (incomingCount.get(t) || 0) + 1);
  }

  // Roots are nodes that have outgoing relationships and 0 incoming (or explicitly selected root)
  let roots = [];
  if (focusRootId !== 'ALL' && nodeMap.has(Number(focusRootId))) {
    roots = [nodeMap.get(Number(focusRootId))];
  } else {
    roots = nodes.filter(
      (n) => (incomingCount.get(Number(n.id)) || 0) === 0 && (childrenBySource.get(Number(n.id))?.length || 0) > 0
    );
    if (roots.length === 0 && edges.length > 0) {
      // Fallback in case of cycles: pick nodes with highest out-degree
      roots = nodes
        .filter((n) => (childrenBySource.get(Number(n.id))?.length || 0) > 0)
        .slice(0, 5);
    }
  }

  const buildSubtree = (node, visited = new Set(), depth = 0) => {
    if (!node || depth > 5) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(Number(node.id));

    const outLinks = childrenBySource.get(Number(node.id)) || [];
    const childBranches = outLinks
      .filter((lnk) => !nextVisited.has(Number(lnk.targetNode.id)))
      .map((lnk) => ({
        edgeId: lnk.edgeId,
        linkType: lnk.linkType,
        description: lnk.description,
        subtree: buildSubtree(lnk.targetNode, nextVisited, depth + 1),
      }))
      .filter((b) => b.subtree !== null);

    return {
      node,
      children: childBranches,
    };
  };

  return roots.map((r) => buildSubtree(r)).filter(Boolean);
}

function TreeNodeCard({ tree, onSelectNode, isRoot = false }) {
  const { node, children } = tree;
  const statusColor =
    node.inciState === 'Incident'
      ? '#dc2626'
      : node.inciState === 'Warning'
      ? '#d97706'
      : '#059669';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <Tooltip title={`Click to inspect ${node.name} (#${node.ciNumber})`}>
        <div
          onClick={() => onSelectNode?.(node.id)}
          style={{
            cursor: 'pointer',
            padding: '10px 14px',
            borderRadius: 9,
            background: isRoot ? 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)' : '#ffffff',
            border: `1.5px solid ${node.inciState !== 'Operational' ? statusColor : isRoot ? '#93c5fd' : '#cbd5e1'}`,
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
            minWidth: 235,
            maxWidth: 310,
            transition: 'all 0.15s ease',
          }}
        >
          <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size={6}>
              <span style={{ color: '#2563eb', fontSize: 15 }}>{getClassIcon(node.className)}</span>
              <Text strong style={{ fontSize: 13 }}>
                {node.name}
              </Text>
            </Space>
            <Badge color={statusColor} />
          </Space>
          <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
              {node.className}
            </Tag>
            <Tag color={getIncidentColor(node.inciState)} style={{ fontSize: 11, margin: 0 }}>
              {node.inciState}
            </Tag>
            {node.ipAddress && node.ipAddress !== '—' && (
              <Tag style={{ fontSize: 11, margin: 0 }} className="mono-code">
                {node.ipAddress}
              </Tag>
            )}
          </div>
        </div>
      </Tooltip>

      {children && children.length > 0 && (
        <div
          style={{
            marginLeft: 22,
            paddingLeft: 18,
            borderLeft: '2px dashed #94a3b8',
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {children.map((branch) => (
            <div key={`${node.id}-${branch.subtree.node.id}`} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    width: 14,
                    height: 2,
                    background: '#94a3b8',
                    display: 'inline-block',
                    marginLeft: -18,
                  }}
                />
                <Tag color="purple" style={{ fontSize: 10.5, margin: 0 }}>
                  {branch.linkType}
                </Tag>
                {branch.description && (
                  <Text type="secondary" style={{ fontSize: 11.5 }}>
                    {branch.description}
                  </Text>
                )}
              </div>
              <TreeNodeCard tree={branch.subtree} onSelectNode={onSelectNode} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopologyDiagram({ nodes = [], edges = [], onSelectNode }) {
  const [focusRoot, setFocusRoot] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState(12);

  const connectedNodes = useMemo(() => {
    const linkedIds = new Set();
    for (const e of edges) {
      linkedIds.add(Number(e.sourceId));
      linkedIds.add(Number(e.targetId));
    }
    return nodes.filter((n) => linkedIds.has(Number(n.id)));
  }, [nodes, edges]);

  const trees = useMemo(
    () => buildDependencyTrees(nodes, edges, focusRoot),
    [nodes, edges, focusRoot]
  );

  const displayedTrees = focusRoot === 'ALL' ? trees.slice(0, visibleCount) : trees;

  return (
    <Card
      className="enterprise-card"
      title={`Interactive Infrastructure Dependency Topology (${trees.length} Stacks)`}
      extra={
        <Space>
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Focus Stack / Root CI:
          </Text>
          <Select
            style={{ width: 280 }}
            size="small"
            showSearch
            optionFilterProp="label"
            value={focusRoot}
            onChange={(val) => {
              setFocusRoot(val);
              setVisibleCount(12);
            }}
            options={[
              { label: 'All Infrastructure Stacks', value: 'ALL' },
              ...connectedNodes.map((n) => ({
                label: `${n.name} (${n.className})`,
                value: n.id,
              })),
            ]}
          />
        </Space>
      }
    >
      {trees.length === 0 ? (
        <Empty description="No Configuration Item dependency chains found for current filter" />
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: 24,
              alignItems: 'start',
            }}
          >
            {displayedTrees.map((t) => (
              <div
                key={t.node.id}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  overflowX: 'auto',
                }}
              >
                <TreeNodeCard tree={t} onSelectNode={onSelectNode} isRoot />
              </div>
            ))}
          </div>
          {focusRoot === 'ALL' && trees.length > visibleCount && (
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <Button onClick={() => setVisibleCount((c) => c + 12)}>
                Show More Infrastructure Stacks ({visibleCount} of {trees.length} shown)
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
