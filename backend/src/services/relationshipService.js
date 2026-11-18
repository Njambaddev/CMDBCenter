const env = require('../config/env');
const { znunyRequest, resolveZnunyAuth, getCacheEntry, setCached } = require('./znunyClient');
const { getRawInventoryList, hasWarmComponentInventory, warmLiveInventory } = require('./cmdbService');
const { getDemoState, addDemoRelationship, removeDemoRelationship } = require('./demoStore');
const { recordAudit } = require('./auditService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Derives real topological links from matching infrastructure keys across live CIs
 * when Znuny's `/links/list` (`Link::LinkList`) Perl module is absent on staging.
 * Matches:
 * - PDU (`pdu_ip`) -> Circuits (`pdu_ip`) -> Outlets (`pdu_ip` + `binding_circuit`)
 * - Chassis Info (`bmc_ip` / `hostname`) -> Servers (`bmc_ip` / `hostname`)
 * - Servers (`hostname` / `bmc_ip`) -> BMC Manager / Storage Controller / Storage Devices / Processors / Memory / NIC / GPUs
 * - Switch / Firewall (`hostname` / `mgmt_ip`) -> NIC Ethernet Interfaces (`hostname`)
 */
function inferTopologyFromAttributes(cis = []) {
  const inferred = [];
  const byHostname = new Map();
  const byBmcIp = new Map();
  const pdusByIp = new Map();
  const circuitsByPduAndIdx = new Map();

  for (const ci of cis) {
    const h = (ci.attributes?.hostname || '').toLowerCase().trim();
    const bmc = (ci.attributes?.bmc_ip || '').trim();
    const pduIp = (ci.attributes?.pdu_ip || '').trim();

    if (ci.className === 'Servers') {
      if (h) byHostname.set(h, ci);
      if (bmc) byBmcIp.set(bmc, ci);
    } else if (ci.className === 'Switch' || ci.className === 'Firewall') {
      if (h && !byHostname.has(h)) byHostname.set(h, ci);
    } else if (ci.className === 'PDU' && pduIp) {
      pdusByIp.set(pduIp, ci);
    } else if (ci.className === 'Circuits' && pduIp) {
      const idx = String(ci.attributes?.circuit_index || '').trim();
      circuitsByPduAndIdx.set(`${pduIp}::${idx}`, ci);
    }
  }

  let seq = 1;
  for (const ci of cis) {
    const h = (ci.attributes?.hostname || '').toLowerCase().trim();
    const bmc = (ci.attributes?.bmc_ip || '').trim();
    const pduIp = (ci.attributes?.pdu_ip || '').trim();

    if (ci.className === 'Circuits' && pduIp && pdusByIp.has(pduIp)) {
      const parentPdu = pdusByIp.get(pduIp);
      inferred.push({
        id: `inf-${seq++}`,
        sourceType: 'ITSMConfigItem',
        sourceId: parentPdu.id,
        targetType: 'ITSMConfigItem',
        targetId: ci.id,
        linkType: 'Includes',
        description: `Inferred via PDU IP ${pduIp}`,
        origin: 'inferred',
      });
    } else if (ci.className === 'Outlets' && pduIp) {
      const bindIdx = String(ci.attributes?.binding_circuit || '').trim();
      const parentCircuit = circuitsByPduAndIdx.get(`${pduIp}::${bindIdx}`) || pdusByIp.get(pduIp);
      if (parentCircuit) {
        inferred.push({
          id: `inf-${seq++}`,
          sourceType: 'ITSMConfigItem',
          sourceId: parentCircuit.id,
          targetType: 'ITSMConfigItem',
          targetId: ci.id,
          linkType: 'Includes',
          description: `Inferred via PDU ${pduIp} / Circuit ${bindIdx || 'N/A'}`,
          origin: 'inferred',
        });
      }
    } else if (ci.className === 'Chassis Info') {
      const matchedServer = (h && byHostname.get(h)) || (bmc && byBmcIp.get(bmc));
      if (matchedServer && matchedServer.id !== ci.id) {
        inferred.push({
          id: `inf-${seq++}`,
          sourceType: 'ITSMConfigItem',
          sourceId: ci.id,
          targetType: 'ITSMConfigItem',
          targetId: matchedServer.id,
          linkType: 'Includes',
          description: `Shared host/BMC (${h || bmc})`,
          origin: 'inferred',
        });
      }
    } else if (
      [
        'BMC Manager',
        'Storage Controller',
        'Storage Devices',
        'Processors Info',
        'Memory',
        'GPUs Info',
        'Power Supply Units Info',
        'Fans',
        'NIC Ethernet Interfaces',
      ].includes(ci.className)
    ) {
      const parentHost = (h && byHostname.get(h)) || (bmc && byBmcIp.get(bmc));
      if (parentHost && parentHost.id !== ci.id) {
        inferred.push({
          id: `inf-${seq++}`,
          sourceType: 'ITSMConfigItem',
          sourceId: parentHost.id,
          targetType: 'ITSMConfigItem',
          targetId: ci.id,
          linkType: ci.className === 'BMC Manager' ? 'DependsOn' : 'Includes',
          description: `Matched host ${parentHost.hostname || bmc}`,
          origin: 'inferred',
        });
      }
    }
  }

  return inferred;
}

/**
 * Probes Znuny `PDU_CircuitsOutlets_API` `/links/list` and handles the missing `Link::*` Perl modules gracefully.
 * Memoizes `ZNUNY_MODULE_MISSING` for 30 minutes so opening CI drawers or topology never blocks on repeated 500 probes.
 */
async function probeLiveLinkOperation(session, objectType = 'ITSMConfigItem', objectKey = '1') {
  const memoizedMissing = getCacheEntry('links:module_missing');
  if (memoizedMissing && memoizedMissing.isFresh) {
    return memoizedMissing.value;
  }

  const authPayload = await resolveZnunyAuth(session);
  try {
    const res = await znunyRequest({
      webservice: env.znuny.wsCmdb,
      method: 'POST',
      route: '/links/list',
      body: {
        ...authPayload,
        Object: objectType,
        Key: String(objectKey),
      },
      context: 'Link::LinkList',
    });
    return {
      linkApiSupported: true,
      statusReason: null,
      data: res,
    };
  } catch (err) {
    if (err.code === 'ZNUNY_MODULE_MISSING') {
      const unsupportedPayload = {
        linkApiSupported: false,
        statusReason:
          'Webservice ID 7 (PDU_CircuitsOutlets_API) defines /links, /links/delete, and /links/list, but Kernel/GenericInterface/Operation/Link/*.pm is not installed on Mysupport-Prod-App. Showing live attribute-correlated topology (read-only) until Link::* modules are deployed.',
        data: null,
      };
      setCached('links:module_missing', unsupportedPayload, 1800, { persist: true });
      return unsupportedPayload;
    }
    throw err;
  }
}

function enrichRelationships(rawRels, ciMap, ticketMap = new Map()) {
  return rawRels.map((rel) => {
    const sourceNode =
      rel.sourceType === 'ITSMConfigItem'
        ? ciMap.get(Number(rel.sourceId))
        : ticketMap.get(Number(rel.sourceId));
    const targetNode =
      rel.targetType === 'ITSMConfigItem'
        ? ciMap.get(Number(rel.targetId))
        : ticketMap.get(Number(rel.targetId));

    return {
      ...rel,
      origin: rel.origin || 'znuny_api',
      source: sourceNode
        ? {
            id: sourceNode.id,
            type: rel.sourceType,
            number: sourceNode.ciNumber || sourceNode.ticketNumber,
            name: sourceNode.name || sourceNode.title,
            className: sourceNode.className || 'Ticket',
            inciState: sourceNode.inciState || sourceNode.state,
            deplState: sourceNode.deplState || sourceNode.priority,
            location: sourceNode.location || sourceNode.queue || '—',
          }
        : { id: rel.sourceId, type: rel.sourceType, name: `${rel.sourceType} #${rel.sourceId}` },
      target: targetNode
        ? {
            id: targetNode.id,
            type: rel.targetType,
            number: targetNode.ciNumber || targetNode.ticketNumber,
            name: targetNode.name || targetNode.title,
            className: targetNode.className || 'Ticket',
            inciState: targetNode.inciState || targetNode.state,
            deplState: targetNode.deplState || targetNode.priority,
            location: targetNode.location || targetNode.queue || '—',
          }
        : { id: rel.targetId, type: rel.targetType, name: `${rel.targetType} #${rel.targetId}` },
    };
  });
}

async function getTopologyGraph(session, { includeComponents = false } = {}) {
  if (session.mode === 'demo') {
    const { cis, relationships, tickets } = getDemoState();
    const ciMap = new Map(cis.map((c) => [c.id, c]));
    const ticketMap = new Map(tickets.map((t) => [t.id, t]));
    const ciOnlyRels = relationships.filter((r) => r.sourceType === 'ITSMConfigItem' && r.targetType === 'ITSMConfigItem');
    return {
      mode: 'demo',
      linkApiSupported: true,
      statusReason: null,
      nodes: cis.map((c) => ({
        id: c.id,
        ciNumber: c.ciNumber,
        name: c.name,
        className: c.className,
        deplState: c.deplState,
        inciState: c.inciState,
        location: c.location,
        ipAddress: c.ipAddress,
        hostname: c.hostname,
      })),
      edges: enrichRelationships(ciOnlyRels, ciMap, ticketMap),
    };
  }

  const useComponents = includeComponents || hasWarmComponentInventory();
  if (!hasWarmComponentInventory()) {
    warmLiveInventory(session);
  }
  const cis = await getRawInventoryList(session, { includeComponents: useComponents });
  const ciMap = new Map(cis.map((c) => [c.id, c]));
  const probe = await probeLiveLinkOperation(session, 'ITSMConfigItem', cis[0]?.id || 1);

  let rawEdges = [];
  if (probe.linkApiSupported && Array.isArray(probe.data?.LinkList)) {
    rawEdges = probe.data.LinkList.map((l, idx) => ({
      id: `live-rel-${idx}`,
      sourceType: l.SourceObject || 'ITSMConfigItem',
      sourceId: Number(l.SourceKey),
      targetType: l.TargetObject || 'ITSMConfigItem',
      targetId: Number(l.TargetKey),
      linkType: l.Type || 'Includes',
      origin: 'znuny_api',
    }));
  } else {
    rawEdges = inferTopologyFromAttributes(cis);
  }

  // Filter out granular DIMM/Fan leaf nodes unless requested so graph stays legible
  const filteredCis = includeComponents
    ? cis
    : cis.filter((c) => !['Memory', 'Fans', 'Outlets'].includes(c.className));
  const allowedIds = new Set(filteredCis.map((c) => c.id));
  const visibleEdges = rawEdges.filter((e) => allowedIds.has(Number(e.sourceId)) && allowedIds.has(Number(e.targetId)));

  return {
    mode: 'live',
    linkApiSupported: probe.linkApiSupported,
    statusReason: probe.statusReason,
    nodes: filteredCis.map((c) => ({
      id: c.id,
      ciNumber: c.ciNumber,
      name: c.name,
      className: c.className,
      deplState: c.deplState,
      inciState: c.inciState,
      location: c.location,
      ipAddress: c.ipAddress,
      hostname: c.hostname,
    })),
    edges: enrichRelationships(visibleEdges, ciMap),
  };
}

async function getCIRelationships(session, ciId) {
  const numericId = Number(ciId);
  if (session.mode === 'demo') {
    const { cis, relationships, tickets } = getDemoState();
    const ciMap = new Map(cis.map((c) => [c.id, c]));
    const ticketMap = new Map(tickets.map((t) => [t.id, t]));
    const matching = relationships.filter(
      (r) =>
        (r.sourceType === 'ITSMConfigItem' && r.sourceId === numericId) ||
        (r.targetType === 'ITSMConfigItem' && r.targetId === numericId)
    );
    const enriched = enrichRelationships(matching, ciMap, ticketMap);
    return {
      linkApiSupported: true,
      statusReason: null,
      parents: enriched.filter((r) => r.targetType === 'ITSMConfigItem' && r.targetId === numericId && r.sourceType === 'ITSMConfigItem'),
      children: enriched.filter((r) => r.sourceType === 'ITSMConfigItem' && r.sourceId === numericId && r.targetType === 'ITSMConfigItem'),
      associatedTickets: enriched.filter((r) => r.sourceType === 'Ticket' || r.targetType === 'Ticket'),
    };
  }

  const useComponents = hasWarmComponentInventory();
  if (!useComponents) {
    warmLiveInventory(session);
  }
  const cis = await getRawInventoryList(session, { includeComponents: useComponents });
  const ciMap = new Map(cis.map((c) => [c.id, c]));
  const probe = await probeLiveLinkOperation(session, 'ITSMConfigItem', numericId);

  let allEdges = [];
  if (probe.linkApiSupported && Array.isArray(probe.data?.LinkList)) {
    allEdges = probe.data.LinkList.map((l, idx) => ({
      id: `live-${numericId}-${idx}`,
      sourceType: l.SourceObject || 'ITSMConfigItem',
      sourceId: Number(l.SourceKey),
      targetType: l.TargetObject || 'ITSMConfigItem',
      targetId: Number(l.TargetKey),
      linkType: l.Type || 'Includes',
      origin: 'znuny_api',
    }));
  } else {
    allEdges = inferTopologyFromAttributes(cis).filter(
      (e) => Number(e.sourceId) === numericId || Number(e.targetId) === numericId
    );
  }

  const enriched = enrichRelationships(allEdges, ciMap);
  return {
    linkApiSupported: probe.linkApiSupported,
    statusReason: probe.statusReason,
    parents: enriched.filter((r) => r.targetType === 'ITSMConfigItem' && Number(r.targetId) === numericId && r.sourceType === 'ITSMConfigItem'),
    children: enriched.filter((r) => r.sourceType === 'ITSMConfigItem' && Number(r.sourceId) === numericId && r.targetType === 'ITSMConfigItem'),
    associatedTickets: enriched.filter((r) => r.sourceType === 'Ticket' || r.targetType === 'Ticket'),
  };
}

async function createRelationship(session, { sourceType = 'ITSMConfigItem', sourceId, targetType = 'ITSMConfigItem', targetId, linkType = 'Includes', description = '' }) {
  if (!sourceId || !targetId) {
    throw new ApiError(400, 'Both sourceId and targetId are required to create a relationship.', 'MISSING_LINK_ENDPOINTS');
  }
  if (sourceType === targetType && Number(sourceId) === Number(targetId)) {
    throw new ApiError(400, 'Cannot link an item to itself.', 'SELF_LINK_INVALID');
  }

  if (session.mode === 'demo') {
    const created = addDemoRelationship({ sourceType, sourceId, targetType, targetId, linkType, description });
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: 'LINK_CREATE',
      recordType: 'Relationship',
      recordId: created.id,
      recordLabel: `${sourceType}#${sourceId} --[${linkType}]--> ${targetType}#${targetId}`,
      previousValue: null,
      newValue: created,
    });
    return created;
  }

  const authPayload = await resolveZnunyAuth(session);
  // Calls configured route POST /links -> Link::LinkCreate on PDU_CircuitsOutlets_API (ID 7)
  const res = await znunyRequest({
    webservice: env.znuny.wsCmdb,
    method: 'POST',
    route: '/links',
    body: {
      ...authPayload,
      SourceObject: sourceType,
      SourceKey: String(sourceId),
      TargetObject: targetType,
      TargetKey: String(targetId),
      Type: linkType,
      State: 'Valid',
    },
    context: 'Link::LinkCreate',
  });

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: 'LINK_CREATE',
    recordType: 'Relationship',
    recordId: `${sourceType}:${sourceId}->${targetType}:${targetId}`,
    recordLabel: `${sourceType}#${sourceId} --[${linkType}]--> ${targetType}#${targetId}`,
    previousValue: null,
    newValue: res,
  });

  return res;
}

async function deleteRelationship(session, relId, body = {}) {
  if (session.mode === 'demo') {
    const removed = removeDemoRelationship(relId);
    if (!removed) throw new ApiError(404, `Relationship ${relId} not found.`, 'LINK_NOT_FOUND');
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: 'LINK_DELETE',
      recordType: 'Relationship',
      recordId: String(relId),
      recordLabel: `${removed.sourceType}#${removed.sourceId} -X-> ${removed.targetType}#${removed.targetId}`,
      previousValue: removed,
      newValue: null,
    });
    return { deletedId: relId };
  }

  const authPayload = await resolveZnunyAuth(session);
  const res = await znunyRequest({
    webservice: env.znuny.wsCmdb,
    method: 'POST',
    route: '/links/delete',
    body: {
      ...authPayload,
      Object1: body.sourceType || 'ITSMConfigItem',
      Key1: String(body.sourceId || ''),
      Object2: body.targetType || 'ITSMConfigItem',
      Key2: String(body.targetId || ''),
      Type: body.linkType || 'Includes',
    },
    context: 'Link::LinkDelete',
  });

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: 'LINK_DELETE',
    recordType: 'Relationship',
    recordId: String(relId),
    recordLabel: 'Removed Znuny Object Link',
    previousValue: body,
    newValue: res,
  });

  return res;
}

module.exports = {
  getTopologyGraph,
  getCIRelationships,
  createRelationship,
  deleteRelationship,
  inferTopologyFromAttributes,
};
