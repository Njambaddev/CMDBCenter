const { getRawInventoryList, matchesLocationFilter } = require('./cmdbService');
const { getRawTicketList } = require('./ticketService');

function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item) || 'Unspecified';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function parseDatePrefix(dateStr, len = 10) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return m[1].slice(0, len);
}

function computeCmdbStatistics(cis = []) {
  const activeCis = cis.filter((c) => c.deplState !== 'Retired' && c.deplState !== 'Inactive');
  const operational = activeCis.filter((c) => c.inciState === 'Operational').length;
  const warning = activeCis.filter((c) => c.inciState === 'Warning').length;
  const incident = activeCis.filter((c) => c.inciState === 'Incident').length;
  const retired = cis.filter((c) => c.deplState === 'Retired' || c.deplState === 'Inactive').length;

  const byClass = countBy(cis, (c) => c.className);
  const byLocation = countBy(cis, (c) => (c.location === '—' ? 'Unassigned Location' : c.location));
  const byVendor = countBy(cis, (c) => (c.vendor === '—' ? 'Unspecified Vendor' : c.vendor));
  const byDeplState = countBy(cis, (c) => c.deplState);
  const byInciState = countBy(cis, (c) => c.inciState);

  // Health rollup per infrastructure class for stacked Recharts visualization
  const classHealthMap = new Map();
  for (const ci of activeCis) {
    if (!classHealthMap.has(ci.className)) {
      classHealthMap.set(ci.className, { className: ci.className, Operational: 0, Warning: 0, Incident: 0 });
    }
    const row = classHealthMap.get(ci.className);
    if (ci.inciState === 'Incident') row.Incident += 1;
    else if (ci.inciState === 'Warning') row.Warning += 1;
    else row.Operational += 1;
  }

  // Missing critical asset metadata report
  const missingInfoAssets = cis
    .filter((c) => c.deplState !== 'Retired')
    .map((c) => {
      const missingFields = [];
      if (!c.serialNumber || c.serialNumber === '—') missingFields.push('Serial Number');
      if (!c.vendor || c.vendor === '—') missingFields.push('Vendor / Manufacturer');
      if (!c.model || c.model === '—') missingFields.push('Model');
      if (!c.location || c.location === '—') missingFields.push('Location / Site');
      return {
        id: c.id,
        ciNumber: c.ciNumber,
        name: c.name,
        className: c.className,
        deplState: c.deplState,
        missingCount: missingFields.length,
        missingFields: missingFields.join(', '),
      };
    })
    .filter((x) => x.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount);

  return {
    kpis: {
      total: cis.length,
      operational,
      warning,
      incident,
      retired,
    },
    byClass,
    byLocation,
    byVendor,
    byDeplState,
    byInciState,
    healthByClass: Array.from(classHealthMap.values()).slice(0, 10),
    retiredAssets: cis.filter((c) => c.deplState === 'Retired' || c.deplState === 'Inactive'),
    missingInfoAssets,
  };
}

function computeTicketStatistics(tickets = []) {
  const isClosed = (t) => t.stateType === 'closed' || t.state.toLowerCase().includes('closed');
  const isNew = (t) => t.state.toLowerCase() === 'new';
  const isPending = (t) => t.state.toLowerCase().includes('pending');
  const isOpen = (t) => !isClosed(t) && !isNew(t) && !isPending(t) && t.state !== 'merged' && t.state !== 'removed';

  const openCount = tickets.filter(isOpen).length;
  const newCount = tickets.filter(isNew).length;
  const pendingCount = tickets.filter(isPending).length;
  const closedCount = tickets.filter(isClosed).length;
  const approachingSla = tickets.filter((t) => t.slaStatus === 'approaching_breach' || t.slaStatus === 'breached').length;
  const overdueTickets = tickets.filter((t) => t.slaStatus === 'breached');

  const byState = countBy(tickets, (t) => t.state);
  const byPriority = countBy(tickets, (t) => t.priority);
  const byQueue = countBy(tickets, (t) => t.queue || 'Unassigned');
  const byAgent = countBy(tickets, (t) => t.owner || 'Unassigned');
  const bySlaStatus = countBy(tickets, (t) => {
    if (t.slaStatus === 'breached') return 'SLA Breached';
    if (t.slaStatus === 'approaching_breach') return 'Approaching Breach';
    if (t.slaStatus === 'within_sla') return 'Within SLA';
    if (t.slaStatus === 'met') return 'SLA Met (Closed)';
    return 'No SLA Assigned';
  });

  // Ticket creation vs activity trend (by day across available dataset)
  const dayBuckets = new Map();
  for (const t of tickets) {
    const createdDay = parseDatePrefix(t.created, 10);
    if (createdDay) {
      if (!dayBuckets.has(createdDay)) dayBuckets.set(createdDay, { date: createdDay, created: 0, resolved: 0 });
      dayBuckets.get(createdDay).created += 1;
    }
    if (isClosed(t)) {
      const resolvedDay = parseDatePrefix(t.updated, 10);
      if (resolvedDay) {
        if (!dayBuckets.has(resolvedDay)) dayBuckets.set(resolvedDay, { date: resolvedDay, created: 0, resolved: 0 });
        dayBuckets.get(resolvedDay).resolved += 1;
      }
    }
  }
  const ticketTrends = Array.from(dayBuckets.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  // Monthly ticket resolution trends
  const monthBuckets = new Map();
  for (const t of tickets) {
    const createdMonth = parseDatePrefix(t.created, 7);
    if (createdMonth) {
      if (!monthBuckets.has(createdMonth)) monthBuckets.set(createdMonth, { month: createdMonth, opened: 0, resolved: 0 });
      monthBuckets.get(createdMonth).opened += 1;
    }
    if (isClosed(t)) {
      const closedMonth = parseDatePrefix(t.updated, 7);
      if (closedMonth) {
        if (!monthBuckets.has(closedMonth)) monthBuckets.set(closedMonth, { month: closedMonth, opened: 0, resolved: 0 });
        monthBuckets.get(closedMonth).resolved += 1;
      }
    }
  }
  const monthlyResolutionTrends = Array.from(monthBuckets.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  return {
    kpis: {
      total: tickets.length,
      open: openCount,
      new: newCount,
      pending: pendingCount,
      closed: closedCount,
      approachingSla,
      overdue: overdueTickets.length,
    },
    byState,
    byPriority,
    byQueue,
    byAgent,
    bySlaStatus,
    ticketTrends,
    monthlyResolutionTrends,
    overdueTickets,
    slaWatchlist: tickets.filter((t) => t.slaStatus === 'approaching_breach' || t.slaStatus === 'breached'),
  };
}

/**
 * Builds a rich per-location operational breakdown across all sites in the CMDB.
 */
function computeLocationSummaries(allCis = []) {
  const buckets = new Map();

  for (const ci of allCis) {
    const locName = !ci.location || ci.location === '—' ? 'Unassigned Location' : ci.location;
    if (!buckets.has(locName)) {
      buckets.set(locName, {
        location: locName,
        total: 0,
        active: 0,
        operational: 0,
        warning: 0,
        incident: 0,
        retired: 0,
        missingMetadataCount: 0,
        lastUpdated: '',
        classCounts: new Map(),
      });
    }
    const b = buckets.get(locName);
    b.total += 1;

    const isRetired = ci.deplState === 'Retired' || ci.deplState === 'Inactive';
    if (isRetired) {
      b.retired += 1;
    } else {
      b.active += 1;
      if (ci.inciState === 'Incident') b.incident += 1;
      else if (ci.inciState === 'Warning') b.warning += 1;
      else b.operational += 1;

      if (
        !ci.serialNumber ||
        ci.serialNumber === '—' ||
        !ci.vendor ||
        ci.vendor === '—' ||
        !ci.model ||
        ci.model === '—'
      ) {
        b.missingMetadataCount += 1;
      }
    }

    b.classCounts.set(ci.className, (b.classCounts.get(ci.className) || 0) + 1);
    if (ci.lastUpdated && String(ci.lastUpdated) > b.lastUpdated) {
      b.lastUpdated = String(ci.lastUpdated);
    }
  }

  return Array.from(buckets.values())
    .map((b) => {
      const sortedClasses = Array.from(b.classCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((x, y) => y.count - x.count);
      const healthPct = b.active > 0 ? Math.round((b.operational / b.active) * 100) : 100;
      return {
        location: b.location,
        total: b.total,
        active: b.active,
        operational: b.operational,
        warning: b.warning,
        incident: b.incident,
        retired: b.retired,
        healthPct,
        classCount: sortedClasses.length,
        topClasses: sortedClasses.slice(0, 4),
        missingMetadataCount: b.missingMetadataCount,
        lastUpdated: b.lastUpdated,
      };
    })
    .sort((a, b) => {
      if (a.location === 'Unassigned Location') return 1;
      if (b.location === 'Unassigned Location') return -1;
      return b.total - a.total;
    });
}

async function getDashboardSummary(session, { includeComponents = false, location = 'ALL', forceRefresh = false } = {}) {
  const allCis = await getRawInventoryList(session, { includeComponents, forceRefresh });
  const locationSummaries = computeLocationSummaries(allCis);
  const availableLocations = locationSummaries.map((l) => ({
    location: l.location,
    total: l.total,
  }));

  const scopedCis =
    location && location !== 'ALL'
      ? allCis.filter((c) => matchesLocationFilter(c.location, location))
      : allCis;

  const cmdb = computeCmdbStatistics(scopedCis);

  const recentlyUpdatedCIs = [...scopedCis]
    .sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')))
    .slice(0, 10);

  return {
    mode: session.mode,
    generatedAt: new Date().toISOString(),
    selectedLocation: location || 'ALL',
    totalGlobalCIs: allCis.length,
    availableLocations,
    locationSummaries,
    cmdb,
    recentlyUpdatedCIs,
    attentionCIs: scopedCis.filter((c) => c.inciState !== 'Operational' && c.deplState !== 'Retired').slice(0, 10),
  };
}

module.exports = {
  computeCmdbStatistics,
  computeLocationSummaries,
  computeTicketStatistics,
  getDashboardSummary,
};
