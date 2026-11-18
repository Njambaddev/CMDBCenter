const https = require('https');
const axios = require('axios');
const env = require('../config/env');
const {
  CMDB_CLASSES,
  GENERAL_CATALOGS,
  BUILTIN_CLASS_NAMES,
  registerClassSchema,
} = require('../config/cmdbSchemas');
const { invalidateCachePrefix } = require('./znunyClient');
const { recordAudit } = require('./auditService');
const { ApiError } = require('../middleware/errorHandler');

const httpsAgent = new https.Agent({
  rejectUnauthorized: env.znuny.rejectUnauthorized,
  keepAlive: true,
});

const webClient = axios.create({
  timeout: env.znuny.timeoutMs,
  httpsAgent,
  maxRedirects: 0,
  validateStatus: () => true,
  headers: {
    ...(env.znuny.hostHeader ? { Host: env.znuny.hostHeader } : {}),
  },
});

function getZnunyIndexUrl() {
  return env.znuny.baseUrl.replace(/\/nph-genericinterface\.pl.*$/i, '/index.pl');
}

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHtml(str = '') {
  return decodeHtmlEntities(String(str).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function yamlScalar(val) {
  const s = String(val ?? '');
  if (
    s === '' ||
    /[:#[\]{}&*!|>'"%@`]/.test(s) ||
    /^\s|\s$/.test(s) ||
    /^(true|false|yes|no|on|off|null|~|\d+(\.\d+)?)$/i.test(s)
  ) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

/**
 * Generates a valid Znuny 6.5 `ITSMConfigItem` YAML class definition from structured field definitions.
 */
function buildZnunyClassYaml(fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ApiError(400, 'At least one attribute field is required in a Znuny CMDB class definition.', 'EMPTY_CLASS_FIELDS');
  }

  const seenKeys = new Set();
  const lines = ['---'];

  for (const rawField of fields) {
    const key = String(rawField.key || '').trim();
    const label = String(rawField.label || key).trim();
    const type = String(rawField.type || 'Text').trim();
    const searchable = Boolean(rawField.searchable);
    const required = Boolean(rawField.required);

    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
      throw new ApiError(
        400,
        `Invalid attribute key "${key}". Keys must start with a letter and contain only letters, numbers, or underscores (e.g. serial_number).`,
        'INVALID_FIELD_KEY'
      );
    }
    const lowerKey = key.toLowerCase();
    if (seenKeys.has(lowerKey)) {
      throw new ApiError(400, `Duplicate attribute key "${key}" in class definition.`, 'DUPLICATE_FIELD_KEY');
    }
    seenKeys.add(lowerKey);

    lines.push(`- Key: ${yamlScalar(key)}`);
    lines.push(`  Name: ${yamlScalar(label)}`);
    if (searchable) {
      lines.push('  Searchable: 1');
    }
    lines.push('  Input:');

    if (type === 'GeneralCatalog') {
      const catClass = String(rawField.catalogClass || 'ITSM::ConfigItem::YesNo').trim();
      lines.push('    Type: GeneralCatalog');
      lines.push(`    Class: ${yamlScalar(catClass)}`);
      lines.push('    Translation: 1');
    } else if (type === 'Integer') {
      lines.push('    Type: Integer');
      lines.push(`    ValueMin: ${Number.isFinite(Number(rawField.min)) ? Number(rawField.min) : 0}`);
      lines.push(`    ValueMax: ${Number.isFinite(Number(rawField.max)) ? Number(rawField.max) : 999999}`);
      lines.push('    ValueDefault: 0');
    } else if (type === 'Date' || type === 'DateTime') {
      lines.push(`    Type: ${type}`);
      lines.push('    YearPeriodPast: 20');
      lines.push('    YearPeriodFuture: 20');
    } else if (type === 'TextArea') {
      lines.push('    Type: TextArea');
    } else if (type === 'Customer' || type === 'CustomerCompany') {
      lines.push(`    Type: ${type}`);
    } else {
      const maxLen = Math.min(500, Math.max(1, Number(rawField.maxLength || 100)));
      const size = Math.min(50, maxLen);
      lines.push('    Type: Text');
      lines.push(`    Size: ${size}`);
      lines.push(`    MaxLength: ${maxLen}`);
    }

    if (required) {
      lines.push('    Required: 1');
      lines.push('  CountMin: 1');
      lines.push('  CountMax: 1');
      lines.push('  CountDefault: 1');
    } else if (rawField.countMax && Number(rawField.countMax) > 1) {
      lines.push('  CountMin: 0');
      lines.push(`  CountMax: ${Number(rawField.countMax)}`);
      lines.push('  CountDefault: 0');
    }
  }

  return `${lines.join('\n')}\n`;
}

function inferFieldSection(key = '', label = '') {
  const probe = `${key} ${label}`.toLowerCase();
  if (/(ip|mac|vlan|port|subnet|gateway|fqdn|loopback|nic|network|circuit|protocol)/.test(probe)) return 'network';
  if (/(site|location|address|rack|room|building|dc|datacenter|floor)/.test(probe)) return 'location';
  if (/(owner|customer|project|licence|license|warranty|expiry|expiration|contract|purchase|asset_tag|sku|tax)/.test(probe)) {
    return 'ownership';
  }
  if (/(vendor|manufacturer|model|serial|cpu|processor|ram|memory|disk|storage|drive|bios|firmware|watt|volt|amp|psu|chassis)/.test(probe)) {
    return 'hardware';
  }
  return 'general';
}

/**
 * Parses a Znuny YAML class definition string into structured frontend schema fields.
 */
function parseZnunyClassYaml(yamlText = '') {
  const fields = [];
  if (!yamlText || typeof yamlText !== 'string') return fields;

  const cleanUnquote = (v = '') =>
    String(v)
      .trim()
      .replace(/^'(.*)'$/, (_, inner) => inner.replace(/''/g, "'"))
      .replace(/^"(.*)"$/, '$1');

  const rawLines = yamlText.split(/\r?\n/);
  let current = null;
  let inInput = false;
  let inSub = false;

  for (const line of rawLines) {
    if (!line.trim() || line.trim().startsWith('#') || line.trim() === '---') continue;

    // Top-level field start: `- Key: ...`
    const topMatch = line.match(/^-\s+Key:\s*(.+)$/);
    if (topMatch) {
      if (current && current.key) fields.push(current);
      const key = cleanUnquote(topMatch[1]);
      current = {
        key,
        label: key,
        type: 'Text',
        searchable: false,
        required: false,
        section: inferFieldSection(key, key),
      };
      inInput = false;
      inSub = false;
      continue;
    }

    if (!current) continue;

    if (/^\s{2}Sub:\s*$/.test(line)) {
      inSub = true;
      inInput = false;
      continue;
    }
    if (inSub && /^\s{2}[A-Za-z]/.test(line)) {
      inSub = false;
    }
    if (inSub) continue;

    if (/^\s{2}Input:\s*$/.test(line)) {
      inInput = true;
      continue;
    }
    if (inInput && /^\s{2}[A-Za-z]/.test(line)) {
      inInput = false;
    }

    const propMatch = line.match(/^\s{2}([A-Za-z0-9_]+):\s*(.+)$/);
    if (propMatch && !inInput) {
      const [, k, rawV] = propMatch;
      const v = cleanUnquote(rawV);
      if (k === 'Name') {
        current.label = v;
        current.section = inferFieldSection(current.key, v);
      } else if (k === 'Searchable') {
        current.searchable = v === '1' || v.toLowerCase() === 'true';
      } else if (k === 'CountMin' && Number(v) >= 1) {
        current.required = true;
      }
      continue;
    }

    const inputMatch = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.+)$/);
    if (inputMatch && inInput) {
      const [, ik, rawIv] = inputMatch;
      const iv = cleanUnquote(rawIv);
      if (ik === 'Type') current.type = iv;
      else if (ik === 'Class') {
        current.catalogClass = iv;
        current.options = GENERAL_CATALOGS[iv] || ['Yes', 'No'];
      } else if (ik === 'MaxLength') current.maxLength = Number(iv) || 100;
      else if (ik === 'ValueMin') current.min = Number(iv) || 0;
      else if (ik === 'ValueMax') current.max = Number(iv) || 999999;
      else if (ik === 'Required' && (iv === '1' || iv.toLowerCase() === 'true')) current.required = true;
    }
  }

  if (current && current.key) fields.push(current);
  return fields;
}

/**
 * Logs into Znuny's `/otrs/index.pl` web interface to obtain an `OTRSAgentInterface` cookie
 * used strictly on the backend for `AdminGeneralCatalog` & `AdminITSMConfigItem` class operations.
 */
async function createZnunyWebSession(userLogin, password) {
  const indexUrl = getZnunyIndexUrl();
  const form = new URLSearchParams({
    Action: 'Login',
    RequestedURL: 'Action=AdminITSMConfigItem',
    Lang: 'en',
    TimeZoneOffset: '0',
    User: String(userLogin || '').trim(),
    Password: String(password || ''),
  });

  let res;
  try {
    res = await webClient.post(indexUrl, form.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: 'OTRSBrowserHasCookie=1',
      },
    });
  } catch (err) {
    throw new ApiError(503, `Unable to reach Znuny Admin interface at ${indexUrl}: ${err.message}`, 'ZNUNY_UNREACHABLE');
  }

  const setCookies = res.headers['set-cookie'] || [];
  const cookiePairs = ['OTRSBrowserHasCookie=1'];
  let foundSessionCookie = false;

  for (const rawCookie of setCookies) {
    const pair = String(rawCookie).split(';')[0].trim();
    if (!pair || pair.startsWith('OTRSBrowserHasCookie=')) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const val = pair.slice(eqIdx + 1).trim();
      if (val && val !== 'deleted') {
        cookiePairs.push(pair);
        foundSessionCookie = true;
      }
    }
  }

  if (!foundSessionCookie) {
    throw new ApiError(401, 'Znuny rejected agent credentials for Admin session.', 'ZNUNY_AUTH_FAIL');
  }

  return cookiePairs.join('; ');
}

async function znunyWebGet(paramsObj, cookieHeader) {
  const indexUrl = getZnunyIndexUrl();
  const qs = new URLSearchParams(paramsObj).toString();
  const res = await webClient.get(`${indexUrl}?${qs}`, {
    headers: { Cookie: cookieHeader },
  });
  return { status: res.status, html: typeof res.data === 'string' ? res.data : String(res.data || ''), headers: res.headers };
}

async function znunyWebPost(formObj, cookieHeader) {
  const indexUrl = getZnunyIndexUrl();
  const body = new URLSearchParams(formObj).toString();
  const res = await webClient.post(indexUrl, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
    },
  });
  return { status: res.status, html: typeof res.data === 'string' ? res.data : String(res.data || ''), headers: res.headers };
}

function extractChallengeToken(html = '') {
  const m =
    html.match(/name=["']ChallengeToken["']\s+value=["']([A-Za-z0-9]+)["']/i) ||
    html.match(/value=["']([A-Za-z0-9]+)["']\s+name=["']ChallengeToken["']/i);
  return m ? m[1] : null;
}

function isLoginScreen(html = '') {
  return /name=["']Action["']\s+value=["']Login["']/i.test(html) && !extractChallengeToken(html);
}

function checkPermissionDenied(html = '', userLogin = '') {
  if (/No Permission/i.test(html) || /FatalError/i.test(html) && /Permission/i.test(html)) {
    throw new ApiError(
      403,
      `Znuny account "${userLogin}" does not have Znuny "admin" module permission required to create or modify CMDB Classes.`,
      'ZNUNY_ADMIN_FORBIDDEN'
    );
  }
}

async function resolveAdminWebCookie(session, suppliedPassword = '') {
  if (suppliedPassword) {
    const freshCookie = await createZnunyWebSession(session.userLogin, suppliedPassword);
    session.znunyWebCookie = freshCookie;
    return freshCookie;
  }

  if (session.znunyWebCookie) {
    const probe = await znunyWebGet({ Action: 'AdminITSMConfigItem' }, session.znunyWebCookie);
    if (!isLoginScreen(probe.html)) {
      return session.znunyWebCookie;
    }
    session.znunyWebCookie = null;
  }

  // Try reusing the GenericInterface SessionID directly as OTRSAgentInterface cookie
  if (session.znunySessionId) {
    const candidate = `OTRSBrowserHasCookie=1; OTRSAgentInterface=${session.znunySessionId}`;
    const probe = await znunyWebGet({ Action: 'AdminITSMConfigItem' }, candidate);
    if (!isLoginScreen(probe.html)) {
      session.znunyWebCookie = candidate;
      return candidate;
    }
  }

  if (env.znuny.serviceUser && env.znuny.servicePassword) {
    const svcCookie = await createZnunyWebSession(env.znuny.serviceUser, env.znuny.servicePassword);
    return svcCookie;
  }

  throw new ApiError(
    401,
    `Confirm your Znuny password for @${session.userLogin} once to authorize Admin Class creation in Znuny.`,
    'ZNUNY_ADMIN_AUTH_REQUIRED'
  );
}

/**
 * Reads Znuny's `AdminITSMConfigItem` overview to discover all live `(ClassID, ClassName)` entries.
 */
async function fetchLiveClassDirectory(cookieHeader, userLogin) {
  const { html } = await znunyWebGet({ Action: 'AdminITSMConfigItem' }, cookieHeader);
  if (isLoginScreen(html)) {
    throw new ApiError(401, 'Znuny Admin session expired. Please confirm your Znuny password.', 'ZNUNY_ADMIN_AUTH_REQUIRED');
  }
  checkPermissionDenied(html, userLogin);

  const challengeToken = extractChallengeToken(html);
  const directory = new Map(); // className -> classId

  const linkRegex = /<a[^>]+href=["'][^"']*Action=AdminITSMConfigItem;Subaction=DefinitionList;ClassID=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const classId = Number(match[1]);
    const text = stripHtml(match[2]);
    if (classId > 0 && text && !/^(change|view|add|edit|\d+)$/i.test(text)) {
      if (!directory.has(text)) {
        directory.set(text, classId);
      }
    }
  }

  return { directory, challengeToken };
}

/**
 * Creates a GeneralCatalog item in `ITSM::ConfigItem::Class` with `itsm-configitem` group permission.
 */
async function createGeneralCatalogClass(cookieHeader, { className, comment = '', preferredGroup = 'itsm-configitem', userLogin }) {
  const editPage = await znunyWebGet(
    {
      Action: 'AdminGeneralCatalog',
      Subaction: 'ItemEdit',
      Class: 'ITSM::ConfigItem::Class',
      ItemID: 'NEW',
    },
    cookieHeader
  );

  if (isLoginScreen(editPage.html)) {
    throw new ApiError(401, 'Znuny Admin session expired.', 'ZNUNY_ADMIN_AUTH_REQUIRED');
  }
  checkPermissionDenied(editPage.html, userLogin);

  const challengeToken = extractChallengeToken(editPage.html);
  if (!challengeToken) {
    throw new ApiError(502, 'Could not obtain Znuny CSRF ChallengeToken from AdminGeneralCatalog.', 'ZNUNY_CSRF_MISSING');
  }

  // Dynamically resolve GroupID for `itsm-configitem` from Znuny's <select name="Permission">
  let permissionGroupId = '5';
  const selectMatch = editPage.html.match(/<select[^>]+name=["']Permission["'][^>]*>([\s\S]*?)<\/select>/i);
  if (selectMatch) {
    const optRegex = /<option[^>]+value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let opt;
    const options = [];
    while ((opt = optRegex.exec(selectMatch[1])) !== null) {
      options.push({ id: opt[1], name: stripHtml(opt[2]) });
    }
    const target =
      options.find((o) => o.name.toLowerCase() === String(preferredGroup).toLowerCase()) ||
      options.find((o) => o.name.toLowerCase().includes('configitem')) ||
      options[0];
    if (target) permissionGroupId = target.id;
  }

  await znunyWebPost(
    {
      ChallengeToken: challengeToken,
      Action: 'AdminGeneralCatalog',
      Subaction: 'ItemEditAction',
      Class: 'ITSM::ConfigItem::Class',
      ItemID: 'NEW',
      Name: className,
      Permission: permissionGroupId,
      ValidID: '1',
      Comment: comment || `Created via CMDB Center by ${userLogin}`,
    },
    cookieHeader
  );
}

/**
 * Opens `AdminITSMConfigItem;Subaction=DefinitionChange;ClassID=<id>` to read exact form parameter names,
 * saves the YAML definition, and verifies the new version in Znuny.
 */
async function saveClassDefinitionYamlInZnuny(cookieHeader, { classId, yamlString, userLogin }) {
  const changePage = await znunyWebGet(
    {
      Action: 'AdminITSMConfigItem',
      Subaction: 'DefinitionChange',
      ClassID: String(classId),
    },
    cookieHeader
  );

  if (isLoginScreen(changePage.html)) {
    throw new ApiError(401, 'Znuny Admin session expired.', 'ZNUNY_ADMIN_AUTH_REQUIRED');
  }
  checkPermissionDenied(changePage.html, userLogin);

  const challengeToken = extractChallengeToken(changePage.html);
  if (!challengeToken) {
    throw new ApiError(502, 'Could not obtain ChallengeToken from AdminITSMConfigItem.', 'ZNUNY_CSRF_MISSING');
  }

  // Extract form's hidden Subaction value (e.g. `DefinitionSave`) and textarea name (`Definition`)
  let saveSubaction = 'DefinitionSave';
  const formBlockMatch = changePage.html.match(/<form[^>]*>([\s\S]*?<textarea[\s\S]*?)<\/form>/i);
  const formHtml = formBlockMatch ? formBlockMatch[1] : changePage.html;
  const subMatch = formHtml.match(/<input[^>]+name=["']Subaction["'][^>]+value=["']([^"']+)["']/i);
  if (subMatch) saveSubaction = subMatch[1];

  let textareaName = 'Definition';
  const taMatch = formHtml.match(/<textarea[^>]+name=["']([^"']+)["']/i);
  if (taMatch) textareaName = taMatch[1];

  const saveRes = await znunyWebPost(
    {
      ChallengeToken: challengeToken,
      Action: 'AdminITSMConfigItem',
      Subaction: saveSubaction,
      ClassID: String(classId),
      [textareaName]: yamlString,
    },
    cookieHeader
  );

  // If Znuny stayed on DefinitionChange with an error box ( status 200 instead of 302 redirect ), extract the validation error
  if (saveRes.status === 200 && /<textarea/i.test(saveRes.html)) {
    const errBox =
      saveRes.html.match(/<div[^>]+class=["'][^"']*MessageBox\s+Error[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      saveRes.html.match(/<div[^>]+class=["'][^"']*Error[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const reason = errBox ? stripHtml(errBox[1]) : 'Znuny rejected the YAML class definition syntax.';
    throw new ApiError(400, `Znuny YAML validation error: ${reason}`, 'ZNUNY_YAML_INVALID');
  }

  // Verify the saved definition version on DefinitionList
  const listPage = await znunyWebGet(
    {
      Action: 'AdminITSMConfigItem',
      Subaction: 'DefinitionList',
      ClassID: String(classId),
    },
    cookieHeader
  );

  const versions = [...listPage.html.matchAll(/DefinitionID=(\d+)/gi)].map((m) => Number(m[1]));
  return {
    definitionCount: versions.length || 1,
    latestDefinitionId: versions.length > 0 ? Math.max(...versions) : null,
  };
}

/**
 * Creates a brand-new CMDB Class (or updates an existing class's YAML schema version) directly in Znuny,
 * registers it in the dashboard's live schema engine, and records a confirmed audit trail entry.
 */
async function createOrUpdateCmdbClass(session, payload = {}, { allowExistingUpdate = false } = {}) {
  const cleanName = String(payload.name || '').trim();
  const displayLabel = String(payload.displayLabel || cleanName).trim();
  const category = String(payload.category || 'Custom Infrastructure').trim();
  const description = String(payload.description || '').trim();
  const permissionGroup = String(payload.permissionGroup || 'itsm-configitem').trim();
  const adminPassword = payload.adminPassword ? String(payload.adminPassword) : '';

  if (!cleanName || cleanName.length < 2 || cleanName.length > 60) {
    throw new ApiError(400, 'Class Name is required (2–60 characters).', 'INVALID_CLASS_NAME');
  }

  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const yamlString =
    payload.rawYaml && String(payload.rawYaml).trim() !== ''
      ? `${String(payload.rawYaml).trim()}\n`
      : buildZnunyClassYaml(fields);
  const parsedFields = fields.length > 0 ? fields : parseZnunyClassYaml(yamlString);

  if (parsedFields.length === 0) {
    throw new ApiError(400, 'Class definition must include at least one valid attribute field.', 'EMPTY_CLASS_FIELDS');
  }

  if (session.mode === 'demo') {
    const registered = registerClassSchema(
      {
        classId: CMDB_CLASSES[cleanName]?.classId || Math.floor(200 + Math.random() * 700),
        name: cleanName,
        displayLabel,
        category,
        description,
        fields: parsedFields,
        rawYaml: yamlString,
        origin: 'custom',
      },
      { persist: false }
    );
    return registered;
  }

  const cookieHeader = await resolveAdminWebCookie(session, adminPassword);
  const { directory } = await fetchLiveClassDirectory(cookieHeader, session.userLogin);

  // Case-insensitive lookup against Znuny's live GeneralCatalog classes
  let matchedZnunyName = null;
  let classId = null;
  for (const [zName, zId] of directory.entries()) {
    if (zName.toLowerCase() === cleanName.toLowerCase()) {
      matchedZnunyName = zName;
      classId = zId;
      break;
    }
  }

  const isCreatingNew = !classId;
  if (!isCreatingNew && !allowExistingUpdate) {
    throw new ApiError(
      409,
      `CMDB Class "${matchedZnunyName}" already exists in Znuny (ClassID #${classId}). Choose "Edit Schema" to publish a new definition version instead.`,
      'CLASS_ALREADY_EXISTS'
    );
  }

  const finalClassName = matchedZnunyName || cleanName;

  if (isCreatingNew) {
    await createGeneralCatalogClass(cookieHeader, {
      className: finalClassName,
      comment: description,
      preferredGroup: permissionGroup,
      userLogin: session.userLogin,
    });

    const refreshed = await fetchLiveClassDirectory(cookieHeader, session.userLogin);
    for (const [zName, zId] of refreshed.directory.entries()) {
      if (zName.toLowerCase() === finalClassName.toLowerCase()) {
        classId = zId;
        break;
      }
    }

    if (!classId) {
      throw new ApiError(
        502,
        `Znuny did not confirm creation of class "${finalClassName}" in ITSM::ConfigItem::Class. Check Znuny Admin GeneralCatalog permissions.`,
        'ZNUNY_CLASS_UNCONFIRMED'
      );
    }
  }

  const defResult = await saveClassDefinitionYamlInZnuny(cookieHeader, {
    classId,
    yamlString,
    userLogin: session.userLogin,
  });

  // Preserve section hints from UI builder where provided
  const sectionByKey = new Map(fields.map((f) => [String(f.key).toLowerCase(), f.section]));
  const enrichedFields = parseZnunyClassYaml(yamlString).map((pf) => ({
    ...pf,
    section: sectionByKey.get(pf.key.toLowerCase()) || pf.section,
  }));

  const registered = registerClassSchema(
    {
      classId,
      name: finalClassName,
      displayLabel,
      category,
      description,
      definitionVersion: defResult.definitionCount,
      rawYaml: yamlString,
      fields: enrichedFields.length > 0 ? enrichedFields : parsedFields,
      origin: BUILTIN_CLASS_NAMES.has(finalClassName) ? 'builtin_modified' : 'custom',
    },
    { persist: true }
  );

  // Clear CMDB inventory cache keys so subsequent inventory fetches include the new class
  invalidateCachePrefix('cmdb:inventory:');

  recordAudit({
    user: session.userLogin,
    role: session.role,
    mode: 'live',
    action: isCreatingNew ? 'CLASS_CREATE' : 'CLASS_SCHEMA_UPDATE',
    recordType: 'CMDBClass',
    recordId: String(classId),
    recordLabel: `${finalClassName} (ClassID #${classId})`,
    previousValue: isCreatingNew ? null : { className: finalClassName, classId },
    newValue: {
      classId,
      className: finalClassName,
      category,
      fieldCount: registered.fields.length,
      fields: registered.fields.map((f) => f.key),
      definitionVersion: defResult.definitionCount,
    },
  });

  return registered;
}

/**
 * Syncs any custom classes created directly inside Znuny's native Admin UI into our dashboard schema registry.
 */
async function syncClassesFromZnuny(session, { adminPassword = '' } = {}) {
  const cookieHeader = await resolveAdminWebCookie(session, adminPassword);
  const { directory } = await fetchLiveClassDirectory(cookieHeader, session.userLogin);

  const imported = [];
  for (const [className, classId] of directory.entries()) {
    if (CMDB_CLASSES[className] && BUILTIN_CLASS_NAMES.has(className)) {
      continue;
    }

    // Fetch DefinitionChange page which pre-populates the latest YAML inside <textarea>
    const changePage = await znunyWebGet(
      {
        Action: 'AdminITSMConfigItem',
        Subaction: 'DefinitionChange',
        ClassID: String(classId),
      },
      cookieHeader
    );
    const taMatch = changePage.html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
    const rawYaml = taMatch ? decodeHtmlEntities(taMatch[1]) : '';
    const parsedFields = parseZnunyClassYaml(rawYaml);

    const reg = registerClassSchema(
      {
        classId,
        name: className,
        displayLabel: CMDB_CLASSES[className]?.displayLabel || className,
        category: CMDB_CLASSES[className]?.category || 'Custom Infrastructure',
        rawYaml,
        fields: parsedFields.length > 0 ? parsedFields : [{ key: 'Note', label: 'Notes', type: 'TextArea', section: 'general' }],
        origin: 'synced_from_znuny',
      },
      { persist: true }
    );
    imported.push(reg.name);
  }

  if (imported.length > 0) {
    invalidateCachePrefix('cmdb:inventory:');
  }

  return {
    totalZnunyClasses: directory.size,
    syncedCustomClasses: imported,
  };
}

module.exports = {
  buildZnunyClassYaml,
  parseZnunyClassYaml,
  createZnunyWebSession,
  createOrUpdateCmdbClass,
  syncClassesFromZnuny,
};
