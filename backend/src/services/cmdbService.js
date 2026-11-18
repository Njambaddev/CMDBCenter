const env = require('../config/env');
const {
  CMDB_CLASSES,
  CREATION_TEMPLATES,
  DEPLOYMENT_STATES,
  INCIDENT_STATES,
  GENERAL_CATALOGS,
  PRIMARY_INFRA_CLASSES,
  COMPONENT_CLASSES,
} = require('../config/cmdbSchemas');
const {
  normalizeZnunyCI,
  resolveCanonicalLocation,
  buildZnunyCIXMLData,
  groupCIAttributesBySection,
} = require('./cmdbTransformer');
const {
  znunyRequest,
  resolveZnunyAuth,
  getCacheEntry,
  setCached,
  listCacheKeys,
} = require('./znunyClient');
const { getDemoState, addDemoCI, updateDemoCI, deleteDemoCI } = require('./demoStore');
const { recordAudit } = require('./auditService');
const { ApiError } = require('../middleware/errorHandler');

const MAX_IDS_PER_GET = 600;
const MAX_ID_PATH_CHARS = 3800; // Keeps full GET URL well below Apache's 8190-byte LimitRequestLine
const SEARCH_CONCURRENCY = 3;
const GET_CONCURRENCY = 2;
const INVENTORY_FRESH_TTL_SEC = Math.max(Number(env.cacheTtlSeconds || 60), 300); // 5 min fresh, 24h SWR
const EMPTY_CLASS_MEMO_MS = 30 * 60 * 1000;

// Shipped default ITSM classes that currently hold 0 CIs in Atlancis CMDB; checked non-blockingly on cold start
const SPARSE_DEFAULT_CLASSES = new Set(['Computer', 'Network', 'Software']);
const knownEmptyClasses = new Map(); // className -> expiresAt timestamp
const IN_FLIGHT_FETCHES = new Map();

function getAllClassesKey() {
  return `cmdb:inventory:${[...PRIMARY_INFRA_CLASSES, ...COMPONENT_CLASSES].sort().join(',')}`;
}

function getPrimaryClassesKey() {
  return `cmdb:inventory:${[...PRIMARY_INFRA_CLASSES].sort().join(',')}`;
}

function ensureCanonicalLocations(items = []) {
  return items.map((ci) => {
    const loc = resolveCanonicalLocation({
      className: ci.className,
      name: ci.name,
      attrs: ci.attributes || {},
    });
    return loc !== ci.location ? { ...ci, location: loc } : ci;
  });
}

function matchesLocationFilter(ciLocation = '—', filterLocation = 'ALL') {
  if (!filterLocation || filterLocation === 'ALL') return true;
  const target = String(filterLocation).trim().toLowerCase();
  const actual = String(ciLocation || '—').trim();
  if (target === 'unassigned location' || target === '—' || target === 'unassigned') {
    return !actual || actual === '—' || actual.toLowerCase() === 'unassigned location';
  }
  return actual.toLowerCase() === target || actual.toLowerCase().includes(target);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Packs up to 600 ConfigItemIDs per `ConfigItemGet` request while keeping URL length < 3.8 KB.
 * Cuts ~485 primary CIs from 10 HTTP round-trips down to 1 single HTTP round-trip!
 */
function chunkIdsForUrl(ids) {
  const chunks = [];
  let current = [];
  let charCount = 0;
  for (const id of ids) {
    const token = String(id);
    const added = current.length === 0 ? token.length : token.length + 1;
    if (current.length >= MAX_IDS_PER_GET || charCount + added > MAX_ID_PATH_CHARS) {
      chunks.push(current);
      current = [token];
      charCount = token.length;
    } else {
      current.push(token);
      charCount += added;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function getRoutePrefixForClass(className) {
  return CMDB_CLASSES[className]?.wsRoutePrefix || '/servers';
}

function isClassMemoizedEmpty(cls) {
  const exp = knownEmptyClasses.get(cls);
  if (!exp) return false;
  if (Date.now() > exp) {
    knownEmptyClasses.delete(cls);
    return false;
  }
  return true;
}

async function searchClassIds(authPayload, cls) {
  const prefix = getRoutePrefixForClass(cls);
  try {
    const res = await znunyRequest({
      webservice: env.znuny.wsCmdb,
      method: 'POST',
      route: `${prefix}/search`,
      body: {
        ...authPayload,
        ConfigItem: {
          Class: cls,
        },
      },
      context: `CMDB Search (${cls})`,
    });
    const rawIds = res.ConfigItemIDs ?? res.ConfigItemID;
    const ids = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
    const clean = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (clean.length === 0) {
      knownEmptyClasses.set(cls, Date.now() + EMPTY_CLASS_MEMO_MS);
    } else {
      knownEmptyClasses.delete(cls);
    }
    return clean;
  } catch (err) {
    if (err.code === 'ZNUNY_AUTH_FAIL' || err.code === 'ZNUNY_UNREACHABLE') throw err;
    return [];
  }
}

async function fetchItemsByIds(authPayload, idList) {
  if (!idList || idList.length === 0) return [];
  const idChunks = chunkIdsForUrl(idList);
  const items = [];
  const fetchBatches = chunkArray(idChunks, GET_CONCURRENCY);

  for (const group of fetchBatches) {
    const results = await Promise.all(
      group.map(async (chunk) => {
        const res = await znunyRequest({
          webservice: env.znuny.wsCmdb,
          method: 'GET',
          route: `/servers/${chunk.join(',')}`,
          params: authPayload,
          context: `CMDB Batch Get (${chunk.length} CIs)`,
        });
        return Array.isArray(res.ConfigItem) ? res.ConfigItem : res.ConfigItem ? [res.ConfigItem] : [];
      })
    );
    for (const rawList of results) {
      for (const raw of rawList) {
        items.push(normalizeZnunyCI(raw));
      }
    }
  }
  return items;
}

/**
 * Core upstream fetcher against Znuny `PDU_CircuitsOutlets_API` (ID 7).
 * Deduplicated via `IN_FLIGHT_FETCHES` so concurrent requests share a single upstream run.
 */
function runUpstreamInventoryFetch(session, classes, cacheKey, { forceProbeEmpty = false } = {}) {
  if (IN_FLIGHT_FETCHES.has(cacheKey)) {
    return IN_FLIGHT_FETCHES.get(cacheKey);
  }

  const workPromise = (async () => {
    const authPayload = await resolveZnunyAuth(session);

    const priorityClasses = [];
    const deferredSparseClasses = [];

    for (const cls of classes) {
      if (!forceProbeEmpty && classes.length > 1 && isClassMemoizedEmpty(cls)) {
        continue;
      }
      if (!forceProbeEmpty && classes.length > 3 && SPARSE_DEFAULT_CLASSES.has(cls)) {
        deferredSparseClasses.push(cls);
      } else {
        priorityClasses.push(cls);
      }
    }

    const allIds = new Set();
    const classBatches = chunkArray(priorityClasses, SEARCH_CONCURRENCY);
    for (const batch of classBatches) {
      const batchLists = await Promise.all(batch.map((cls) => searchClassIds(authPayload, cls)));
      for (const list of batchLists) {
        for (const id of list) allIds.add(id);
      }
    }

    const idList = Array.from(allIds);
    const items = await fetchItemsByIds(authPayload, idList);
    setCached(cacheKey, items, INVENTORY_FRESH_TTL_SEC, { persist: true });

    // Non-blockingly verify deferred sparse classes (Computer/Network/Software) in the background
    if (deferredSparseClasses.length > 0) {
      setImmediate(async () => {
        try {
          const extraIds = [];
          for (const cls of deferredSparseClasses) {
            const found = await searchClassIds(authPayload, cls);
            extraIds.push(...found);
          }
          if (extraIds.length > 0) {
            const extraItems = await fetchItemsByIds(authPayload, extraIds);
            if (extraItems.length > 0) {
              const mergedMap = new Map(items.map((i) => [i.id, i]));
              for (const ex of extraItems) mergedMap.set(ex.id, ex);
              setCached(cacheKey, Array.from(mergedMap.values()), INVENTORY_FRESH_TTL_SEC, { persist: true });
            }
          }
        } catch (_bgErr) {
          // Non-fatal background check
        }
      });
    }

    return items;
  })();

  IN_FLIGHT_FETCHES.set(cacheKey, workPromise);
  workPromise.finally(() => {
    IN_FLIGHT_FETCHES.delete(cacheKey);
  });

  return workPromise;
}

/**
 * Fetches live ConfigItems with Stale-While-Revalidate (SWR):
 * - Fresh cache (< 5m): returns immediately (< 5ms).
 * - Stale cache (5m..24h, including disk snapshot across restarts): returns cached Znuny data immediately (< 5ms)
 *   and refreshes from Znuny `PDU_CircuitsOutlets_API` asynchronously in the background.
 * - `forceRefresh: true`: waits for fresh upstream Znuny data.
 */
async function fetchLiveInventory(session, { classes = PRIMARY_INFRA_CLASSES, forceRefresh = false } = {}) {
  const sortedKey = [...classes].sort().join(',');
  const cacheKey = `cmdb:inventory:${sortedKey}`;

  if (!forceRefresh) {
    const entry = getCacheEntry(cacheKey);
    if (entry) {
      if (entry.isStale) {
        runUpstreamInventoryFetch(session, classes, cacheKey, { forceProbeEmpty: false }).catch(() => {});
      }
      return entry.value;
    }
  }

  return runUpstreamInventoryFetch(session, classes, cacheKey, { forceProbeEmpty: forceRefresh });
}

function hasWarmComponentInventory() {
  return Boolean(getCacheEntry(getAllClassesKey()));
}

/**
 * Pre-warms primary CMDB inventory immediately upon agent login, then gently pre-warms
 * component classes in the background so Topology & Component views open instantaneously.
 */
function warmLiveInventory(session) {
  if (!session || session.mode === 'demo') return;
  setImmediate(async () => {
    try {
      const primaryKey = getPrimaryClassesKey();
      const allKey = getAllClassesKey();
      const primaryEntry = getCacheEntry(primaryKey);
      let primaryItems;
      if (!primaryEntry || primaryEntry.isStale) {
        primaryItems = await runUpstreamInventoryFetch(session, PRIMARY_INFRA_CLASSES, primaryKey);
      } else {
        primaryItems = primaryEntry.value;
      }

      const allEntry = getCacheEntry(allKey);
      if (!allEntry || allEntry.isStale) {
        const authPayload = await resolveZnunyAuth(session);
        const compIds = new Set();
        // Gentle concurrency of 2 for background component warming
        for (const batch of chunkArray(COMPONENT_CLASSES, 2)) {
          const lists = await Promise.all(batch.map((cls) => searchClassIds(authPayload, cls)));
          for (const l of lists) for (const id of l) compIds.add(id);
        }
        const compItems = await fetchItemsByIds(authPayload, Array.from(compIds));
        const merged = new Map();
        for (const item of primaryItems || []) merged.set(item.id, item);
        for (const item of compItems) merged.set(item.id, item);
        setCached(allKey, Array.from(merged.values()), INVENTORY_FRESH_TTL_SEC, { persist: true });
      }
    } catch (_err) {
      // Background warm is best-effort
    }
  });
}

function findCachedCIById(numericId) {
  for (const key of [getAllClassesKey(), getPrimaryClassesKey(), ...listCacheKeys('cmdb:inventory:')]) {
    const entry = getCacheEntry(key);
    if (entry && Array.isArray(entry.value)) {
      const match = entry.value.find((c) => c.id === numericId);
      if (match) return ensureCanonicalLocations([match])[0];
    }
  }
  return null;
}

function upsertCIInCaches(ci) {
  if (!ci || !ci.id) return;
  knownEmptyClasses.delete(ci.className);
  const primarySet = new Set(PRIMARY_INFRA_CLASSES);
  const primaryKey = getPrimaryClassesKey();

  for (const key of listCacheKeys('cmdb:inventory:')) {
    const entry = getCacheEntry(key);
    if (!entry || !Array.isArray(entry.value)) continue;
    const classesInKey = key.slice('cmdb:inventory:'.length).split(',');
    if (!classesInKey.includes(ci.className) && !(key === primaryKey && primarySet.has(ci.className))) {
      continue;
    }
    const nextList = [...entry.value];
    const idx = nextList.findIndex((item) => item.id === ci.id);
    if (idx >= 0) nextList[idx] = ci;
    else nextList.unshift(ci);
    setCached(key, nextList, INVENTORY_FRESH_TTL_SEC, { persist: true });
  }
}

function removeCIFromCaches(numericId) {
  for (const key of listCacheKeys('cmdb:inventory:')) {
    const entry = getCacheEntry(key);
    if (!entry || !Array.isArray(entry.value)) continue;
    const filtered = entry.value.filter((item) => item.id !== numericId);
    if (filtered.length !== entry.value.length) {
      setCached(key, filtered, INVENTORY_FRESH_TTL_SEC, { persist: true });
    }
  }
}

async function getRawInventoryList(session, { className, includeComponents = false, forceRefresh = false } = {}) {
  if (session.mode === 'demo') {
    return getDemoState().cis;
  }

  const allKey = getAllClassesKey();
  const primaryKey = getPrimaryClassesKey();

  if (!forceRefresh) {
    const allEntry = getCacheEntry(allKey);
    if (allEntry) {
      if (allEntry.isStale) {
        warmLiveInventory(session);
      }
      const cachedAll = ensureCanonicalLocations(allEntry.value);
      if (className && className !== 'ALL') return cachedAll.filter((c) => c.className === className);
      if (includeComponents) return cachedAll;
      const primarySet = new Set(PRIMARY_INFRA_CLASSES);
      return cachedAll.filter((c) => primarySet.has(c.className));
    }

    const primaryEntry = getCacheEntry(primaryKey);
    if (primaryEntry && !includeComponents) {
      if (primaryEntry.isStale) {
        runUpstreamInventoryFetch(session, PRIMARY_INFRA_CLASSES, primaryKey).catch(() => {});
      }
      const cachedPrimary = ensureCanonicalLocations(primaryEntry.value);
      if (className && className !== 'ALL' && PRIMARY_INFRA_CLASSES.includes(className)) {
        return cachedPrimary.filter((c) => c.className === className);
      }
      if (!className || className === 'ALL') {
        return cachedPrimary;
      }
    }
  }

  let targetClasses = PRIMARY_INFRA_CLASSES;
  if (className && className !== 'ALL') {
    targetClasses = [className];
  } else if (includeComponents) {
    const primaryEntry = !forceRefresh ? getCacheEntry(primaryKey) : null;
    if (primaryEntry && Array.isArray(primaryEntry.value)) {
      const compItems = await fetchLiveInventory(session, { classes: COMPONENT_CLASSES, forceRefresh });
      const merged = new Map();
      for (const item of ensureCanonicalLocations(primaryEntry.value)) merged.set(item.id, item);
      for (const item of ensureCanonicalLocations(compItems)) merged.set(item.id, item);
      const combined = Array.from(merged.values());
      setCached(allKey, combined, INVENTORY_FRESH_TTL_SEC, { persist: true });
      return combined;
    }
    targetClasses = [...PRIMARY_INFRA_CLASSES, ...COMPONENT_CLASSES];
  }

  const fetched = await fetchLiveInventory(session, { classes: targetClasses, forceRefresh });
  return ensureCanonicalLocations(fetched);
}

function applyCIFiltersAndSort(items, query = {}) {
  const {
    search,
    className,
    deplState,
    inciState,
    location,
    vendor,
    sortBy = 'lastUpdated',
    sortOrder = 'descend',
  } = query;

  let filtered = [...items];

  if (className && className !== 'ALL') {
    filtered = filtered.filter((c) => c.className === className);
  }
  if (deplState && deplState !== 'ALL') {
    filtered = filtered.filter((c) => c.deplState.toLowerCase() === String(deplState).toLowerCase());
  }
  if (inciState && inciState !== 'ALL') {
    filtered = filtered.filter((c) => c.inciState.toLowerCase() === String(inciState).toLowerCase());
  }
  if (location && location !== 'ALL') {
    filtered = filtered.filter((c) => matchesLocationFilter(c.location, location));
  }
  if (vendor && vendor !== 'ALL') {
    const v = String(vendor).toLowerCase();
    filtered = filtered.filter((c) => c.vendor.toLowerCase().includes(v));
  }
  if (search && String(search).trim() !== '') {
    const q = String(search).trim().toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.ciNumber.toLowerCase().includes(q) ||
        c.serialNumber.toLowerCase().includes(q) ||
        c.hostname.toLowerCase().includes(q) ||
        c.ipAddress.toLowerCase().includes(q) ||
        c.model.toLowerCase().includes(q) ||
        c.vendor.toLowerCase().includes(q)
    );
  }

  const dir = sortOrder === 'ascend' || sortOrder === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    const av = String(a[sortBy] ?? '');
    const bv = String(b[sortBy] ?? '');
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });

  return filtered;
}

async function listCIs(session, query = {}) {
  const includeComponents = String(query.includeComponents) === 'true';
  const forceRefresh = String(query.refresh) === 'true';

  const allItems = await getRawInventoryList(session, {
    className: query.className,
    includeComponents,
    forceRefresh,
  });

  const namedLocations = Array.from(new Set(allItems.map((i) => i.location).filter((v) => v && v !== '—'))).sort();
  if (allItems.some((i) => !i.location || i.location === '—')) {
    namedLocations.push('Unassigned Location');
  }

  // Extract distinct facets for filter dropdowns
  const facets = {
    classes: Array.from(new Set(allItems.map((i) => i.className))).sort(),
    locations: namedLocations,
    vendors: Array.from(new Set(allItems.map((i) => i.vendor).filter((v) => v && v !== '—'))).sort(),
    deplStates: Array.from(new Set(allItems.map((i) => i.deplState))).sort(),
    inciStates: Array.from(new Set(allItems.map((i) => i.inciState))).sort(),
  };

  const filtered = applyCIFiltersAndSort(allItems, query);

  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize || 25)));
  const start = (page - 1) * pageSize;
  const paginated = query.exportAll === 'true' ? filtered : filtered.slice(start, start + pageSize);

  return {
    mode: session.mode,
    items: paginated,
    total: filtered.length,
    totalUnfiltered: allItems.length,
    page,
    pageSize,
    facets,
  };
}

async function getCIById(session, id, { forceLive = false } = {}) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new ApiError(400, 'Invalid Configuration Item ID.', 'INVALID_CI_ID');
  }

  let ci = null;
  if (session.mode === 'demo') {
    ci = getDemoState().cis.find((c) => c.id === numericId);
    if (!ci) throw new ApiError(404, `Configuration Item #${numericId} not found.`, 'CI_NOT_FOUND');
  } else {
    if (!forceLive) {
      ci = findCachedCIById(numericId);
    }
    if (!ci) {
      const authPayload = await resolveZnunyAuth(session);
      const res = await znunyRequest({
        webservice: env.znuny.wsCmdb,
        method: 'GET',
        route: `/servers/${numericId}`,
        params: { ...authPayload, Attachments: 0 },
        context: `ConfigItemGet(${numericId})`,
      });
      const raw = Array.isArray(res.ConfigItem) ? res.ConfigItem[0] : res.ConfigItem;
      if (!raw) throw new ApiError(404, `Configuration Item #${numericId} not found in Znuny.`, 'CI_NOT_FOUND');
      ci = normalizeZnunyCI(raw);
    }
  }

  return {
    ...ci,
    sections: groupCIAttributesBySection(ci),
  };
}

function validateCIPayload({ className, name, deplState, inciState, attributes = {} }) {
  if (!className || !CMDB_CLASSES[className]) {
    throw new ApiError(400, `Unsupported or unknown Znuny CMDB class "${className}".`, 'INVALID_CMDB_CLASS');
  }
  if (!name || String(name).trim().length < 2) {
    throw new ApiError(400, 'Configuration Item Name is required (minimum 2 characters).', 'MISSING_CI_NAME');
  }
  const validDepl = DEPLOYMENT_STATES.some((d) => d.name === deplState);
  if (!validDepl) {
    throw new ApiError(400, `Invalid Deployment State "${deplState}".`, 'INVALID_DEPL_STATE');
  }
  const validInci = INCIDENT_STATES.some((i) => i.name === inciState);
  if (!validInci) {
    throw new ApiError(400, `Invalid Incident State "${inciState}".`, 'INVALID_INCI_STATE');
  }

  const schema = CMDB_CLASSES[className];
  for (const field of schema.fields) {
    if (field.required) {
      const v = attributes[field.key];
      if (v === undefined || v === null || String(v).trim() === '') {
        throw new ApiError(
          400,
          `Missing required field "${field.label}" (${field.key}) for class ${className}.`,
          'MISSING_REQUIRED_ATTRIBUTE'
        );
      }
    }
  }
}

async function createCI(session, payload) {
  const {
    className,
    name,
    deplState = 'Production',
    inciState = 'Operational',
    attributes = {},
  } = payload;

  validateCIPayload({ className, name, deplState, inciState, attributes });

  if (session.mode === 'demo') {
    const created = addDemoCI({
      className,
      name: String(name).trim(),
      deplState,
      inciState,
      attributes,
      actor: session.userLogin,
    });
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: 'CI_CREATE',
      recordType: 'CMDB',
      recordId: created.ciNumber,
      recordLabel: `${created.name} (${created.className})`,
      previousValue: null,
      newValue: { name: created.name, className: created.className, deplState, inciState, attributes },
    });
    return created;
  }

  const authPayload = await resolveZnunyAuth(session);
  const ciXmlData = buildZnunyCIXMLData(className, attributes);
  const prefix = getRoutePrefixForClass(className);

  const res = await znunyRequest({
    webservice: env.znuny.wsCmdb,
    method: 'POST',
    route: prefix,
    body: {
      ...authPayload,
      ConfigItem: {
        Class: className,
        Name: String(name).trim(),
        DeplState: deplState,
        InciState: inciState,
        ...(Object.keys(ciXmlData).length > 0 ? { CIXMLData: ciXmlData } : {}),
      },
    },
    context: `ConfigItemCreate(${className})`,
  });

  if (!res.ConfigItemID) {
    throw new ApiError(502, 'Znuny did not confirm ConfigItemID after create.', 'ZNUNY_UNCONFIRMED');
  }

  const created = await getCIById(session, res.ConfigItemID, { forceLive: true });
  const { sections: _sec, ...rawNormalized } = created;
  upsertCIInCaches(rawNormalized);

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: 'CI_CREATE',
    recordType: 'CMDB',
    recordId: res.Number || String(res.ConfigItemID),
    recordLabel: `${created.name} (${created.className})`,
    previousValue: null,
    newValue: { id: res.ConfigItemID, number: res.Number, className, deplState, inciState, attributes: ciXmlData },
  });

  return created;
}

async function updateCI(session, id, payload) {
  const existing = await getCIById(session, id);
  const nextName = payload.name !== undefined ? String(payload.name).trim() : existing.name;
  const nextDepl = payload.deplState || existing.deplState;
  const nextInci = payload.inciState || existing.inciState;
  const replaceExistingData = Boolean(payload.replaceExistingData);
  const mergedAttrs = replaceExistingData
    ? { ...(payload.attributes || {}) }
    : { ...existing.attributes, ...(payload.attributes || {}) };

  validateCIPayload({
    className: existing.className,
    name: nextName,
    deplState: nextDepl,
    inciState: nextInci,
    attributes: mergedAttrs,
  });

  const actionType = nextDepl === 'Retired' && existing.deplState !== 'Retired' ? 'CI_RETIRE' : 'CI_UPDATE';

  if (session.mode === 'demo') {
    const updated = updateDemoCI(existing.id, {
      name: nextName,
      deplState: nextDepl,
      inciState: nextInci,
      attributes: payload.attributes || {},
      replaceExistingData,
      actor: session.userLogin,
      note: payload.changeNote || (actionType === 'CI_RETIRE' ? 'Retired via ITSM Center' : 'Updated via ITSM Center'),
    });
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: actionType,
      recordType: 'CMDB',
      recordId: existing.ciNumber,
      recordLabel: `${updated.name} (${updated.className})`,
      previousValue: { name: existing.name, deplState: existing.deplState, inciState: existing.inciState, attributes: existing.attributes },
      newValue: { name: updated.name, deplState: updated.deplState, inciState: updated.inciState, attributes: updated.attributes },
    });
    return updated;
  }

  const authPayload = await resolveZnunyAuth(session);
  const ciXmlData = buildZnunyCIXMLData(existing.className, payload.attributes || {});
  const prefix = getRoutePrefixForClass(existing.className);

  const res = await znunyRequest({
    webservice: env.znuny.wsCmdb,
    method: 'PATCH',
    route: `${prefix}/${existing.id}`,
    body: {
      ...authPayload,
      ReplaceExistingData: replaceExistingData ? 1 : 0,
      ConfigItem: {
        Class: existing.className,
        Name: nextName,
        DeplState: nextDepl,
        InciState: nextInci,
        ...(Object.keys(ciXmlData).length > 0 ? { CIXMLData: ciXmlData } : {}),
      },
    },
    context: `ConfigItemUpdate(${existing.id})`,
  });

  if (!res.ConfigItemID) {
    throw new ApiError(502, 'Znuny did not confirm ConfigItemID after update.', 'ZNUNY_UNCONFIRMED');
  }

  const updated = await getCIById(session, existing.id, { forceLive: true });
  const { sections: _sec, ...rawNormalized } = updated;
  upsertCIInCaches(rawNormalized);

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: actionType,
    recordType: 'CMDB',
    recordId: existing.ciNumber,
    recordLabel: `${updated.name} (${updated.className})`,
    previousValue: { name: existing.name, deplState: existing.deplState, inciState: existing.inciState },
    newValue: { name: updated.name, deplState: updated.deplState, inciState: updated.inciState, updatedFields: ciXmlData },
  });

  return updated;
}

async function deleteCI(session, id) {
  const existing = await getCIById(session, id);

  if (session.mode === 'demo') {
    deleteDemoCI(existing.id);
    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: 'CI_DELETE',
      recordType: 'CMDB',
      recordId: existing.ciNumber,
      recordLabel: `${existing.name} (${existing.className})`,
      previousValue: { id: existing.id, name: existing.name, className: existing.className },
      newValue: null,
    });
    return { deletedId: existing.id, ciNumber: existing.ciNumber };
  }

  const authPayload = await resolveZnunyAuth(session);
  const prefix = getRoutePrefixForClass(existing.className);
  const res = await znunyRequest({
    webservice: env.znuny.wsCmdb,
    method: 'DELETE',
    route: `${prefix}/${existing.id}`,
    params: authPayload,
    context: `ConfigItemDelete(${existing.id})`,
  });

  if (!res.ConfigItemID) {
    throw new ApiError(502, 'Znuny did not confirm ConfigItem deletion.', 'ZNUNY_UNCONFIRMED');
  }

  removeCIFromCaches(existing.id);
  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: 'CI_DELETE',
    recordType: 'CMDB',
    recordId: existing.ciNumber,
    recordLabel: `${existing.name} (${existing.className})`,
    previousValue: { id: existing.id, name: existing.name, className: existing.className },
    newValue: null,
  });

  return { deletedId: existing.id, ciNumber: existing.ciNumber };
}

/**
 * Bulk CMDB Preview & Validation:
 * Checks required fields, class validity, duplicate serial numbers / CI identifiers
 * within the uploaded file AND against existing inventory. Never silently overwrites!
 */
async function previewBulkImport(session, { defaultClassName, rows = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, 'No rows provided for bulk preview.', 'EMPTY_BULK_PAYLOAD');
  }

  const existingItems = await getRawInventoryList(session, { includeComponents: hasWarmComponentInventory() });
  const existingBySerial = new Map();
  const existingByName = new Map();
  const existingByNumber = new Map();

  for (const item of existingItems) {
    if (item.serialNumber && item.serialNumber !== '—') {
      existingBySerial.set(item.serialNumber.toLowerCase(), item);
    }
    if (item.name) {
      existingByName.set(`${item.className.toLowerCase()}::${item.name.toLowerCase()}`, item);
    }
    if (item.ciNumber) {
      existingByNumber.set(item.ciNumber.toLowerCase(), item);
    }
  }

  const seenSerialInFile = new Set();
  const seenNameInFile = new Set();

  const evaluatedRows = rows.map((rawRow, idx) => {
    const rowNumber = idx + 1;
    const className = String(rawRow.Class || rawRow.className || defaultClassName || '').trim();
    const name = String(rawRow.Name || rawRow.name || rawRow.hostname || rawRow.FQDN || '').trim();
    const deplState = String(rawRow.DeplState || rawRow.deplState || 'Production').trim();
    const inciState = String(rawRow.InciState || rawRow.inciState || 'Operational').trim();
    const ciNumber = String(rawRow.Number || rawRow.ciNumber || '').trim();

    const errors = [];
    const warnings = [];
    let duplicateMatch = null;

    const schema = CMDB_CLASSES[className];
    if (!schema) {
      errors.push(`Unknown CI Class "${className}"`);
    }
    if (!name) {
      errors.push('Missing CI Name');
    }
    if (!DEPLOYMENT_STATES.some((d) => d.name === deplState)) {
      errors.push(`Invalid Deployment State "${deplState}"`);
    }
    if (!INCIDENT_STATES.some((i) => i.name === inciState)) {
      errors.push(`Invalid Incident State "${inciState}"`);
    }

    // Extract class attributes from row columns (matching either field key or label case-insensitively)
    const attributes = {};
    if (schema) {
      for (const field of schema.fields) {
        const matchKey = Object.keys(rawRow).find(
          (rk) => rk.toLowerCase() === field.key.toLowerCase() || rk.toLowerCase() === field.label.toLowerCase()
        );
        if (matchKey !== undefined && rawRow[matchKey] !== undefined && String(rawRow[matchKey]).trim() !== '') {
          attributes[field.key] = String(rawRow[matchKey]).trim();
        }
        if (field.required && !attributes[field.key]) {
          errors.push(`Missing required attribute "${field.label}" (${field.key})`);
        }
      }
    }

    const serialCandidate =
      attributes.serial_number ||
      attributes.SerialNumber ||
      attributes.serial_no ||
      attributes.mac_address ||
      String(rawRow.SerialNumber || rawRow.serial_number || '').trim();

    if (serialCandidate) {
      const sKey = serialCandidate.toLowerCase();
      if (seenSerialInFile.has(sKey)) {
        errors.push(`Duplicate Serial/MAC "${serialCandidate}" appears multiple times in upload file`);
      }
      seenSerialInFile.add(sKey);

      if (existingBySerial.has(sKey)) {
        const match = existingBySerial.get(sKey);
        duplicateMatch = { id: match.id, ciNumber: match.ciNumber, name: match.name, reason: `Serial "${serialCandidate}" already exists` };
        warnings.push(`Existing CI #${match.ciNumber} (${match.name}) already has Serial "${serialCandidate}"`);
      }
    }

    if (ciNumber && existingByNumber.has(ciNumber.toLowerCase())) {
      const match = existingByNumber.get(ciNumber.toLowerCase());
      duplicateMatch = { id: match.id, ciNumber: match.ciNumber, name: match.name, reason: `CI Number "${ciNumber}" already exists` };
      warnings.push(`CI Number "${ciNumber}" already exists (${match.name})`);
    }

    if (className && name) {
      const nKey = `${className.toLowerCase()}::${name.toLowerCase()}`;
      if (seenNameInFile.has(nKey)) {
        warnings.push(`Duplicate Name "${name}" within upload batch`);
      }
      seenNameInFile.add(nKey);
      if (!duplicateMatch && existingByName.has(nKey)) {
        const match = existingByName.get(nKey);
        duplicateMatch = { id: match.id, ciNumber: match.ciNumber, name: match.name, reason: `CI Name "${name}" already exists in ${className}` };
        warnings.push(`Existing CI #${match.ciNumber} in ${className} already named "${name}"`);
      }
    }

    const status = errors.length > 0 ? 'invalid' : duplicateMatch ? 'duplicate' : 'ready';

    return {
      rowNumber,
      status,
      className,
      name,
      deplState,
      inciState,
      serialNumber: serialCandidate || '—',
      attributes,
      duplicateMatch,
      errors,
      warnings,
    };
  });

  return {
    summary: {
      totalRows: evaluatedRows.length,
      readyCount: evaluatedRows.filter((r) => r.status === 'ready').length,
      duplicateCount: evaluatedRows.filter((r) => r.status === 'duplicate').length,
      invalidCount: evaluatedRows.filter((r) => r.status === 'invalid').length,
    },
    rows: evaluatedRows,
  };
}

/**
 * Executes confirmed Bulk Import.
 * Never silently overwrites duplicates: duplicates are skipped unless `duplicateStrategy === 'update_confirmed'` AND `confirmed === true`.
 */
async function executeBulkImport(session, { rows = [], duplicateStrategy = 'skip', confirmed = false }) {
  if (!confirmed) {
    throw new ApiError(400, 'Explicit user confirmation (`confirmed: true`) is required before executing bulk CMDB operations.', 'CONFIRMATION_REQUIRED');
  }

  const results = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    if (row.status === 'invalid') {
      skippedCount++;
      results.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'skipped_invalid', detail: (row.errors || []).join('; ') });
      continue;
    }

    if (row.status === 'duplicate' && row.duplicateMatch) {
      if (duplicateStrategy !== 'update_confirmed') {
        skippedCount++;
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          outcome: 'skipped_duplicate',
          detail: `Skipped existing CI #${row.duplicateMatch.ciNumber} (${row.duplicateMatch.reason})`,
        });
        continue;
      }

      try {
        const updated = await updateCI(session, row.duplicateMatch.id, {
          name: row.name,
          deplState: row.deplState,
          inciState: row.inciState,
          attributes: row.attributes,
          changeNote: 'Bulk CMDB confirmed update',
        });
        updatedCount++;
        results.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'updated', ciNumber: updated.ciNumber, id: updated.id });
      } catch (err) {
        failedCount++;
        results.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'failed', detail: err.message });
      }
      continue;
    }

    try {
      const created = await createCI(session, {
        className: row.className,
        name: row.name,
        deplState: row.deplState,
        inciState: row.inciState,
        attributes: row.attributes,
      });
      createdCount++;
      results.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'created', ciNumber: created.ciNumber, id: created.id });
    } catch (err) {
      failedCount++;
      results.push({ rowNumber: row.rowNumber, name: row.name, outcome: 'failed', detail: err.message });
    }
  }

  return {
    summary: {
      totalProcessed: rows.length,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
    },
    results,
  };
}

/**
 * Bulk updates selected CIs (e.g., deployment state, incident state, site/location, owner) after explicit confirmation.
 */
async function executeBulkUpdate(session, { ids = [], patch = {}, confirmed = false }) {
  if (!confirmed) {
    throw new ApiError(400, 'Explicit confirmation is required before bulk updating Configuration Items.', 'CONFIRMATION_REQUIRED');
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'Select at least one Configuration Item to update.', 'NO_CIS_SELECTED');
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      const updated = await updateCI(session, id, {
        ...(patch.deplState ? { deplState: patch.deplState } : {}),
        ...(patch.inciState ? { inciState: patch.inciState } : {}),
        ...(patch.attributes ? { attributes: patch.attributes } : {}),
        changeNote: patch.changeNote || 'Bulk Inventory Update',
      });
      succeeded++;
      results.push({ id, ciNumber: updated.ciNumber, name: updated.name, outcome: 'updated' });
    } catch (err) {
      failed++;
      results.push({ id, outcome: 'failed', detail: err.message });
    }
  }

  return { succeeded, failed, results };
}

function getSchemasMetadata() {
  return {
    classes: CMDB_CLASSES,
    templates: CREATION_TEMPLATES,
    deploymentStates: DEPLOYMENT_STATES,
    incidentStates: INCIDENT_STATES,
    generalCatalogs: GENERAL_CATALOGS,
    primaryInfraClasses: PRIMARY_INFRA_CLASSES,
    componentClasses: COMPONENT_CLASSES,
  };
}

module.exports = {
  getSchemasMetadata,
  getRawInventoryList,
  matchesLocationFilter,
  hasWarmComponentInventory,
  warmLiveInventory,
  listCIs,
  getCIById,
  createCI,
  updateCI,
  deleteCI,
  previewBulkImport,
  executeBulkImport,
  executeBulkUpdate,
};
