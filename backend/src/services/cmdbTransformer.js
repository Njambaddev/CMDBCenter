const { CMDB_CLASSES, DEPLOYMENT_STATES, INCIDENT_STATES } = require('../config/cmdbSchemas');

const DEPL_FUNCTIONALITY = Object.fromEntries(DEPLOYMENT_STATES.map((d) => [d.name.toLowerCase(), d.functionality]));
const INCI_FUNCTIONALITY = Object.fromEntries(INCIDENT_STATES.map((i) => [i.name.toLowerCase(), i.functionality]));

/**
 * Safely unwraps scalar/array/nested-hash values returned by Znuny's InvertFormatXMLData
 */
function unwrapScalar(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    for (const item of val) {
      const u = unwrapScalar(item);
      if (u !== '') return u;
    }
    return '';
  }
  if (typeof val === 'object') {
    if ('Content' in val) return unwrapScalar(val.Content);
    const keys = Object.keys(val);
    if (keys.length === 1) return unwrapScalar(val[keys[0]]);
    return JSON.stringify(val);
  }
  return String(val).trim();
}

/**
 * Flattens Znuny `CIXMLData` (including nested `Sub` structures like Computer.NIC or Network.NetworkAddress)
 * into a clean key->value dictionary for UI display and form editing, while preserving raw CIXMLData.
 */
function flattenCIXMLData(className, ciXmlData = {}) {
  const flat = {};
  if (!ciXmlData || typeof ciXmlData !== 'object') return flat;

  const schema = CMDB_CLASSES[className];
  const subFieldMap = new Map();
  if (schema) {
    for (const f of schema.fields) {
      if (f.subFields && f.subFields.length > 0) {
        subFieldMap.set(f.key, f.subFields);
      }
    }
  }

  for (const [key, rawVal] of Object.entries(ciXmlData)) {
    if (subFieldMap.has(key)) {
      const itemObj = Array.isArray(rawVal) ? rawVal[0] : rawVal;
      if (itemObj && typeof itemObj === 'object') {
        flat[key] = unwrapScalar(itemObj[key]);
        for (const sub of subFieldMap.get(key)) {
          if (itemObj[sub.key] !== undefined) {
            flat[`${key}.${sub.key}`] = unwrapScalar(itemObj[sub.key]);
            // Also expose direct subkey if unambiguous (e.g. IPAddress, Capacity, SubnetMask, Gateway)
            if (flat[sub.key] === undefined) {
              flat[sub.key] = unwrapScalar(itemObj[sub.key]);
            }
          }
        }
      } else {
        flat[key] = unwrapScalar(rawVal);
      }
    } else if (Array.isArray(rawVal)) {
      flat[key] = rawVal.map((v) => unwrapScalar(v)).filter(Boolean).join(', ');
    } else {
      flat[key] = unwrapScalar(rawVal);
    }
  }

  return flat;
}

function firstNonEmpty(obj, keys, fallback = '') {
  for (const k of keys) {
    const val = obj[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return fallback;
}

/**
 * Canonicalizes raw site/location strings and naming/subnet hints to match the official
 * Znuny `Location` CIs (`IX Africa`, `Africa Data Center (ADC)`, `Main Office, Top plaza`,
 * `Athi OCP Infra Inventory`) while preserving any custom user-entered site names verbatim.
 */
function canonicalizeLocationLabel(rawLabel = '') {
  const clean = String(rawLabel || '').trim();
  if (!clean || clean === '—') return '';
  const lower = clean.toLowerCase();

  if (lower === 'ix' || lower === 'ixa' || lower === 'ix africa' || lower === 'ixafrica') {
    return 'IX Africa';
  }
  if (
    lower === 'adc' ||
    lower === 'africa data center' ||
    lower === 'africa data centre' ||
    lower.includes('africa data center')
  ) {
    return 'Africa Data Center (ADC)';
  }
  if (lower === 'office/top plaza' || lower.includes('top plaza') || lower === 'main office') {
    return 'Main Office, Top plaza';
  }
  if (lower.includes('athi')) {
    return 'Athi OCP Infra Inventory';
  }
  return clean;
}

function resolveCanonicalLocation({ className = '', name = '', attrs = {} }) {
  const ciName = String(name || '').trim();
  if (className === 'Location' && ciName) {
    return canonicalizeLocationLabel(ciName) || ciName;
  }

  // Note: intentionally excludes `physical_context` (which holds hardware sensor context like "Fan")
  const explicit = firstNonEmpty(attrs, ['site', 'location', 'Location', 'Site', 'Address'], '');
  if (explicit) {
    return canonicalizeLocationLabel(explicit);
  }

  const probeText = `${ciName} ${attrs.hostname || ''} ${attrs.FQDN || ''} ${attrs.Note || ''}`.toLowerCase();
  const ipProbe = `${attrs.mgmt_ip || ''} ${attrs.bmc_ip || ''} ${attrs.pdu_ip || ''} ${attrs.IPAddress || ''}`.trim();

  if (/(^|[-_.\s])adc($|[-_.\s])/.test(probeText) || ipProbe.includes('192.168.30.')) {
    return 'Africa Data Center (ADC)';
  }
  if (
    /(^|[-_.\s])ix($|[-_.\s])/.test(probeText) ||
    /\bix-pdu/i.test(probeText) ||
    ipProbe.includes('10.10.129.') ||
    (attrs.pdu_ip && attrs.pdu_ip.startsWith('10.10.130.'))
  ) {
    return 'IX Africa';
  }
  if (probeText.includes('top plaza')) {
    return 'Main Office, Top plaza';
  }
  if (/\b(athi|ocp)\b/.test(probeText) || (attrs.bmc_ip && attrs.bmc_ip.startsWith('10.10.'))) {
    return 'Athi OCP Infra Inventory';
  }

  return '—';
}

/**
 * Normalizes a raw Znuny ConfigItemGet object into our consistent frontend CI model
 * without losing any class-specific attributes.
 */
function normalizeZnunyCI(raw = {}) {
  const className = raw.Class || raw.className || 'Unknown';
  const ciXmlData = raw.CIXMLData || raw.ciXmlData || {};
  const attrs = flattenCIXMLData(className, ciXmlData);

  const deplState = raw.CurDeplState || raw.DeplState || 'Production';
  const inciState = raw.CurInciState || raw.InciState || 'Operational';

  const vendor = firstNonEmpty(attrs, ['manufacturer', 'vendor', 'Vendor', 'mfg_name', 'vendor_family'], '—');
  const model = firstNonEmpty(attrs, ['system_model', 'model', 'Model', 'chassis_model', 'product_name', 'SKU', 'Version'], '—');
  const serialNumber = firstNonEmpty(attrs, ['serial_number', 'SerialNumber', 'serial_no', 'mac_address', 'base_mac', 'uuid'], '—');
  const location = resolveCanonicalLocation({
    className,
    name: raw.Name || raw.name || '',
    attrs,
  });
  const owner = firstNonEmpty(attrs, ['Owner', 'owner', 'CustomerID', 'project', 'ProjectName'], 'IT Operations');
  const ipAddress = firstNonEmpty(attrs, ['mgmt_ip', 'bmc_ip', 'pdu_ip', 'IPAddress', 'NIC.IPAddress', 'loopback_ip', 'NetworkAddress'], '');
  const hostname = firstNonEmpty(attrs, ['hostname', 'FQDN', 'name', 'drive_name', 'controller_name', 'psu_name', 'fan_name'], raw.Name || '');

  return {
    id: Number(raw.ConfigItemID || raw.id),
    ciNumber: String(raw.Number || raw.ciNumber || ''),
    name: String(raw.Name || raw.name || ''),
    className,
    versionId: Number(raw.VersionID || raw.LastVersionID || 1),
    definitionId: Number(raw.DefinitionID || 1),
    deplState,
    deplStateType: raw.CurDeplStateType || raw.DeplStateType || DEPL_FUNCTIONALITY[deplState.toLowerCase()] || 'productive',
    inciState,
    inciStateType: raw.CurInciStateType || raw.InciStateType || INCI_FUNCTIONALITY[inciState.toLowerCase()] || 'operational',
    vendor,
    model,
    serialNumber,
    location,
    owner,
    ipAddress,
    hostname,
    health: firstNonEmpty(attrs, ['health', 'health_rollup', 'Status', 'alive', 'amp_state'], inciState === 'Operational' ? 'OK' : inciState),
    lastCollected: firstNonEmpty(attrs, ['last_collected'], ''),
    expiryDate: firstNonEmpty(attrs, ['ExpiryDate', 'WarrantyExpirationDate', 'ExpirationDate', 'LicenceKey.ExpirationDate'], ''),
    createdTime: raw.CreateTime || raw.createdTime || '',
    lastUpdated: raw.ChangeTime || raw.CreateTime || attrs.last_collected || '',
    attributes: attrs,
    rawCIXMLData: ciXmlData,
    attachments: Array.isArray(raw.Attachment) ? raw.Attachment : [],
  };
}

function normalizeDateForZnuny(val) {
  if (!val) return '';
  const s = String(val).trim();
  const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) return `${mIso[1]}-${mIso[2].padStart(2, '0')}-${mIso[3].padStart(2, '0')}`;
  const mDmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mDmy) return `${mDmy[3]}-${mDmy[2].padStart(2, '0')}-${mDmy[1].padStart(2, '0')}`;
  return s;
}

function normalizeDateTimeForZnuny(val) {
  if (!val) return '';
  const s = String(val).trim();
  const mFull = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (mFull) return `${mFull[1]}-${mFull[2]}-${mFull[3]} ${mFull[4]}:${mFull[5]}:${mFull[6] || '00'}`;
  const dateOnly = normalizeDateForZnuny(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return `${dateOnly} 00:00:00`;
  return s;
}

/**
 * Converts clean frontend form values into Znuny's exact class-specific `CIXMLData` structure
 * verified against `Kernel/GenericInterface/Operation/ConfigItem/Common.pm` (lines 785-1055).
 */
function buildZnunyCIXMLData(className, formAttributes = {}) {
  const schema = CMDB_CLASSES[className];
  if (!schema) {
    // Pass-through sanitized non-empty strings for unknown custom classes
    const out = {};
    for (const [k, v] of Object.entries(formAttributes || {})) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        out[k] = String(v).trim();
      }
    }
    return out;
  }

  const ciXmlData = {};

  for (const field of schema.fields) {
    const rawVal = formAttributes[field.key];

    if (field.subFields && field.subFields.length > 0) {
      // Check if parent or any subField is populated
      const subPayload = {};
      let hasAnySub = false;
      for (const sub of field.subFields) {
        const subRaw =
          formAttributes[`${field.key}.${sub.key}`] !== undefined
            ? formAttributes[`${field.key}.${sub.key}`]
            : formAttributes[sub.key];
        if (subRaw !== undefined && subRaw !== null && String(subRaw).trim() !== '') {
          hasAnySub = true;
          let formattedSub = String(subRaw).trim();
          if (sub.type === 'Date') formattedSub = normalizeDateForZnuny(formattedSub);
          if (sub.type === 'Integer') formattedSub = Number(formattedSub);
          subPayload[sub.key] = formattedSub;
        }
      }

      const parentPopulated = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '';
      if (parentPopulated || hasAnySub) {
        // Common.pm expects `{ ParentKey: "val", SubKey1: "val1" }` (or array of such hashes)
        ciXmlData[field.key] = [
          {
            [field.key]: parentPopulated ? String(rawVal).trim() : 'Primary',
            ...subPayload,
          },
        ];
      }
      continue;
    }

    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
      continue;
    }

    if (field.type === 'Date') {
      ciXmlData[field.key] = normalizeDateForZnuny(rawVal);
    } else if (field.type === 'DateTime') {
      ciXmlData[field.key] = normalizeDateTimeForZnuny(rawVal);
    } else if (field.type === 'Integer') {
      const n = parseInt(rawVal, 10);
      if (!Number.isNaN(n)) ciXmlData[field.key] = n;
    } else {
      const str = String(rawVal).trim();
      ciXmlData[field.key] = field.maxLength ? str.slice(0, field.maxLength) : str;
    }
  }

  return ciXmlData;
}

/**
 * Categorizes normalized attributes into logical CI Detail sections:
 * General, Hardware, Network, Ownership, Location
 */
function groupCIAttributesBySection(ci) {
  const schema = CMDB_CLASSES[ci.className];
  const sections = {
    general: [],
    hardware: [],
    network: [],
    ownership: [],
    location: [],
  };

  const seen = new Set();
  if (schema) {
    for (const field of schema.fields) {
      seen.add(field.key);
      const val = ci.attributes?.[field.key];
      if (val !== undefined && val !== '') {
        sections[field.section || 'general'].push({ key: field.key, label: field.label, value: val, type: field.type });
      }
      if (field.subFields) {
        for (const sub of field.subFields) {
          const compoundKey = `${field.key}.${sub.key}`;
          seen.add(compoundKey);
          seen.add(sub.key);
          const subVal = ci.attributes?.[compoundKey] ?? ci.attributes?.[sub.key];
          if (subVal !== undefined && subVal !== '') {
            sections[field.section || 'general'].push({
              key: compoundKey,
              label: `${field.label} — ${sub.label}`,
              value: subVal,
              type: sub.type,
            });
          }
        }
      }
    }
  }

  for (const [k, v] of Object.entries(ci.attributes || {})) {
    if (!seen.has(k) && v !== undefined && v !== '') {
      sections.general.push({ key: k, label: k, value: v, type: 'Text' });
    }
  }

  return sections;
}

module.exports = {
  flattenCIXMLData,
  resolveCanonicalLocation,
  normalizeZnunyCI,
  buildZnunyCIXMLData,
  groupCIAttributesBySection,
};
