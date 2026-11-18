const fs = require('fs');
const path = require('path');

/**
 * Verified Znuny 6.5.1 GeneralCatalog & CMDB Class Definitions
 * Ground-truthed against live MariaDB `Atlancis` schema (configitem_definition + general_catalog)
 * and Webservice ID 7 (`PDU_CircuitsOutlets_API`), plus dynamic custom classes created/synced via ITSM Center.
 */

const CUSTOM_CLASSES_FILE = path.resolve(__dirname, '../../data/custom-cmdb-classes.json');

const DEPLOYMENT_STATES = [
  { name: 'Production', functionality: 'productive' },
  { name: 'Pilot', functionality: 'productive' },
  { name: 'Planned', functionality: 'preproductive' },
  { name: 'Maintenance', functionality: 'productive' },
  { name: 'Repair', functionality: 'productive' },
  { name: 'Review', functionality: 'productive' },
  { name: 'Faulty', functionality: 'productive' },
  { name: 'Expired', functionality: 'productive' },
  { name: 'Inactive', functionality: 'postproductive' },
  { name: 'Retired', functionality: 'postproductive' },
];

const INCIDENT_STATES = [
  { name: 'Operational', functionality: 'operational' },
  { name: 'Warning', functionality: 'warning' },
  { name: 'Incident', functionality: 'incident' },
];

const GENERAL_CATALOGS = {
  'ITSM::ConfigItem::YesNo': ['Yes', 'No'],
  'ITSM::ConfigItem::Computer::Type': ['Server', 'Desktop', 'Laptop', 'Phone', 'PDA', 'Other'],
  'ITSM::ConfigItem::Hardware::Type': [
    'Switch',
    'Router',
    'Firewall',
    'WLAN Access Point',
    'Security Device',
    'Backup Device',
    'Monitor',
    'Printer',
    'Modem',
    'Docking Station',
    'Scanner',
    'Camera',
    'Beamer',
    'Other',
  ],
  'ITSM::ConfigItem::Location::Type': ['IT Facility', 'Building', 'Floor', 'Room', 'Rack', 'Office', 'Workplace', 'Outlet', 'Other'],
  'ITSM::ConfigItem::Network::Type': ['LAN', 'WLAN', 'Telco', 'GSM', 'Other'],
  'ITSM::ConfigItem::Software::Type': [
    'Server Application',
    'Server OS',
    'Middleware',
    'Client Application',
    'Client OS',
    'Admin Tool',
    'User Tool',
    'Embedded',
    'Other',
  ],
  'ITSM::ConfigItem::Software::LicenceType': [
    'Enterprise Licence',
    'Per Server',
    'Per Processor',
    'Per Node',
    'Per User',
    'Concurrent Users',
    'Volume Licence',
    'Single Licence',
    'Time Restricted',
    'Developer Licence',
    'Open Source',
    'Freeware',
    'Unlimited',
    'Internal',
    'Demo',
  ],
  'ITSM::ConfigItem::Licence::Status': ['Active', 'OK', 'Pending Renewal', 'RENEW', 'Expired', 'Suspended', 'Cancelled'],
};

// Helper to build standard collector fields
const textField = (key, label, { searchable = false, required = false, maxLength = 250, section = 'hardware', placeholder = '' } = {}) => ({
  key,
  label,
  type: 'Text',
  searchable,
  required,
  maxLength,
  section,
  placeholder,
});

const dateTimeField = (key, label, { searchable = true, section = 'general' } = {}) => ({
  key,
  label,
  type: 'DateTime',
  searchable,
  required: false,
  section,
});

const dateField = (key, label, { searchable = true, required = false, section = 'general' } = {}) => ({
  key,
  label,
  type: 'Date',
  searchable,
  required,
  section,
});

const textAreaField = (key, label, { searchable = true, required = false, section = 'general' } = {}) => ({
  key,
  label,
  type: 'TextArea',
  searchable,
  required,
  section,
});

const catalogField = (key, label, catalogClass, { searchable = true, required = false, section = 'general' } = {}) => ({
  key,
  label,
  type: 'GeneralCatalog',
  catalogClass,
  options: GENERAL_CATALOGS[catalogClass] || [],
  searchable,
  required,
  section,
});

/**
 * Complete Registry of all 23 live Znuny CMDB classes + UI Preset Templates
 * `wsRoutePrefix` maps to the exact route configured on Webservice ID 7 (`PDU_CircuitsOutlets_API`).
 * Note: Because Webservice ID 7 uses `MappingInbound: Simple` onto `ConfigItem::ConfigItem*`,
 * classes without a dedicated prefix safely use `/servers` while passing their own `ConfigItem.Class`.
 */
const CMDB_CLASSES = {
  Servers: {
    classId: 139,
    name: 'Servers',
    displayLabel: 'Server (Physical / Compute)',
    category: 'Compute & Blades',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'bmc_ip', 'serial_number'],
    fields: [
      textField('hostname', 'Hostname', { searchable: true, section: 'general', placeholder: 'e.g. athi-ocp-srv01.atlancis.local' }),
      textField('bmc_ip', 'BMC / Management IP', { searchable: true, section: 'network', placeholder: 'e.g. 10.10.131.25' }),
      textField('name', 'System Name', { searchable: true, section: 'general' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware', placeholder: 'e.g. Dell Inc. / Inspur / Wiwynn' }),
      textField('vendor_family', 'Vendor Family', { searchable: true, section: 'hardware' }),
      textField('system_model', 'System Model', { searchable: true, section: 'hardware', placeholder: 'e.g. PowerEdge R750 / Tioga Pass' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('asset_tag', 'Asset Tag', { searchable: true, section: 'ownership' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('sku', 'SKU', { section: 'hardware' }),
      textField('uuid', 'System UUID', { searchable: true, section: 'hardware' }),
      textField('bios_version', 'BIOS Version', { section: 'hardware' }),
      textField('processor_model', 'Processor Model', { section: 'hardware', placeholder: 'e.g. Intel Xeon Gold 6338' }),
      textField('processor_count', 'Processor Count', { section: 'hardware' }),
      textField('memory_total_gib', 'Memory Total (GiB)', { section: 'hardware', placeholder: 'e.g. 512' }),
      textField('power_state', 'Power State', { searchable: true, section: 'general', placeholder: 'On / Off' }),
      textField('health', 'Health', { searchable: true, section: 'general', placeholder: 'OK / Warning / Critical' }),
      textField('health_rollup', 'Health Rollup', { searchable: true, section: 'general' }),
      textField('state', 'Component State', { searchable: true, section: 'general', placeholder: 'Enabled' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  Switch: {
    classId: 150,
    name: 'Switch',
    displayLabel: 'Switch',
    category: 'Network Infrastructure',
    wsRoutePrefix: '/switches',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'mgmt_ip', 'serial_number'],
    fields: [
      textField('hostname', 'Hostname', { searchable: true, section: 'general', placeholder: 'e.g. athi-leaf-sw01' }),
      textField('mgmt_ip', 'Management IP', { searchable: true, section: 'network', placeholder: 'e.g. 10.10.10.11' }),
      textField('loopback_ip', 'Loopback IP', { searchable: true, section: 'network' }),
      textField('base_mac', 'Base MAC Address', { searchable: true, section: 'network' }),
      textField('vendor', 'Vendor', { searchable: true, section: 'hardware', placeholder: 'e.g. Edgecore / Cisco / Arista' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('product_name', 'Product Name', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('os_family', 'OS Family', { searchable: true, section: 'hardware', placeholder: 'e.g. SONiC / NX-OS / IOS-XE' }),
      textField('os_version', 'OS Version', { searchable: true, section: 'hardware' }),
      textField('platform', 'Platform', { section: 'hardware' }),
      textField('hardware_version', 'Hardware Version', { section: 'hardware' }),
      textField('asic', 'ASIC', { section: 'hardware', placeholder: 'e.g. Broadcom Trident3' }),
      textField('port_count', 'Port Count', { section: 'network' }),
      textField('device_role', 'Device Role', { searchable: true, section: 'general', placeholder: 'Spine / Leaf / Core / Access' }),
      textField('site', 'Location / Site', { searchable: true, section: 'location', placeholder: 'e.g. Athi River DC1' }),
      textField('mfg_name', 'Manufacturer Name', { section: 'hardware' }),
      textField('mfg_date', 'Manufacturing Date', { section: 'hardware' }),
      textField('mfg_country', 'Manufacturing Country', { section: 'hardware' }),
      textField('uptime', 'Uptime', { section: 'general' }),
      textField('health', 'Health', { searchable: true, section: 'general', placeholder: 'OK' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  Firewall: {
    classId: 151,
    name: 'Firewall',
    displayLabel: 'Firewall / Security Appliance',
    category: 'Network Infrastructure',
    wsRoutePrefix: '/firewalls',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'mgmt_ip', 'serial_number'],
    fields: [
      textField('hostname', 'Hostname', { searchable: true, section: 'general' }),
      textField('mgmt_ip', 'Management IP', { searchable: true, section: 'network' }),
      textField('vendor', 'Vendor', { searchable: true, section: 'hardware', placeholder: 'e.g. Fortinet / Palo Alto / Sophos' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('system_part_number', 'System Part Number', { section: 'hardware' }),
      textField('os_family', 'OS Family', { searchable: true, section: 'hardware' }),
      textField('os_version', 'OS Version', { searchable: true, section: 'hardware' }),
      textField('bios_version', 'BIOS Version', { section: 'hardware' }),
      textField('asic_version', 'ASIC Version', { section: 'hardware' }),
      textField('cpu_model', 'CPU Model', { section: 'hardware' }),
      textField('cpu_cores', 'CPU Cores', { section: 'hardware' }),
      textField('ram_mb', 'RAM (MB)', { section: 'hardware' }),
      textField('ha_mode', 'HA Mode', { searchable: true, section: 'network', placeholder: 'Active-Passive / Standalone' }),
      textField('operation_mode', 'Operation Mode', { searchable: true, section: 'network', placeholder: 'NAT / Transparent' }),
      textField('device_role', 'Device Role', { searchable: true, section: 'general', placeholder: 'Edge Firewall / Core Firewall' }),
      textField('site', 'Location / Site', { searchable: true, section: 'location' }),
      textField('ips_db_version', 'IPS DB Version', { section: 'general' }),
      textField('virus_db_version', 'Virus DB Version', { section: 'general' }),
      textField('uptime', 'Uptime', { section: 'general' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'Access Point': {
    classId: 152,
    name: 'Access Point',
    displayLabel: 'Access Point',
    category: 'Network Infrastructure',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['mac_address', 'model', 'location'],
    fields: [
      textField('mac_address', 'MAC Address (Item Code)', { searchable: true, required: true, maxLength: 100, section: 'network' }),
      textField('manufacturer', 'Manufacturer', { section: 'hardware', placeholder: 'e.g. Ubiquiti / Cambium / Mikrotik' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('project', 'Project', { searchable: true, section: 'ownership', placeholder: 'KU/Mawingu' }),
      textField('location', 'Department / Location', { searchable: true, section: 'location', placeholder: 'Office/Top Plaza' }),
      textField('owner', 'Owner', { searchable: true, section: 'ownership' }),
      textField('unit_of_measure', 'Unit of Measure', { maxLength: 20, section: 'general', placeholder: 'Pc' }),
      textField('opening_stock', 'Opening Stock', { maxLength: 10, section: 'general' }),
      textField('quantity_in', 'Quantity In', { maxLength: 10, section: 'general' }),
      textField('quantity_out', 'Quantity Out', { maxLength: 10, section: 'general' }),
      textField('closing_stock', 'Closing Stock', { maxLength: 10, section: 'general' }),
      dateField('stock_date', 'Stock Date', { searchable: false, section: 'general' }),
      textAreaField('remarks', 'Comments / Remarks', { searchable: true, section: 'general' }),
    ],
  },

  'Chassis Info': {
    classId: 141,
    name: 'Chassis Info',
    displayLabel: 'Chassis',
    category: 'Compute & Blades',
    wsRoutePrefix: '/chassis',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'bmc_ip', 'serial_number'],
    fields: [
      textField('name', 'Chassis Name', { searchable: true, section: 'general' }),
      textField('hostname', 'Host / Enclosure Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('chassis_model', 'Chassis Model', { searchable: true, section: 'hardware' }),
      textField('chassis_type', 'Chassis Type', { searchable: true, section: 'hardware', placeholder: 'RackMount / Enclosure / Sled' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('asset_tag', 'Asset Tag', { searchable: true, section: 'ownership' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('sku', 'SKU', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  PDU: {
    classId: 136,
    name: 'PDU',
    displayLabel: 'Power Distribution Unit (PDU)',
    category: 'Power & Facilities',
    wsRoutePrefix: '/pdus',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['pdu_ip', 'name', 'serial_no'],
    fields: [
      textField('name', 'PDU Name', { searchable: true, section: 'general' }),
      textField('pdu_ip', 'PDU Management IP', { searchable: true, section: 'network' }),
      textField('model', 'Model', { section: 'hardware' }),
      textField('serial_no', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('alive', 'Alive Status', { searchable: true, section: 'general', placeholder: 'true / 1' }),
    ],
  },

  Circuits: {
    classId: 137,
    name: 'Circuits',
    displayLabel: 'Circuit',
    category: 'Power & Facilities',
    wsRoutePrefix: '/circuits',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['pdu_ip', 'name', 'circuit_index'],
    fields: [
      textField('name', 'Circuit Name', { searchable: true, section: 'general' }),
      textField('pdu_ip', 'Parent PDU IP', { searchable: true, section: 'network' }),
      textField('circuit_index', 'Circuit Index', { searchable: true, section: 'hardware' }),
      textField('rated_amp', 'Rated Amp', { section: 'hardware' }),
      textField('rated_volt', 'Rated Volt', { section: 'hardware' }),
      textField('amp_state', 'Amp State', { searchable: true, section: 'general' }),
      textField('alive', 'Alive', { searchable: true, section: 'general' }),
      textField('alarm', 'Alarm', { section: 'general' }),
    ],
  },

  Outlets: {
    classId: 138,
    name: 'Outlets',
    displayLabel: 'PDU Outlet',
    category: 'Power & Facilities',
    wsRoutePrefix: '/outlets',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['pdu_ip', 'name', 'index'],
    fields: [
      textField('name', 'Outlet Name', { searchable: true, section: 'general' }),
      textField('pdu_ip', 'Parent PDU IP', { searchable: true, section: 'network' }),
      textField('index', 'Outlet Index', { searchable: true, section: 'hardware' }),
      textField('binding_circuit', 'Binding Circuit', { searchable: true, section: 'hardware' }),
      textField('rated_volt', 'Rated Volt', { section: 'hardware' }),
      textField('rated_amp', 'Rated Amp', { section: 'hardware' }),
      textField('amp_state', 'Amp State', { searchable: true, section: 'general' }),
      textField('relay_state', 'Relay State', { searchable: true, section: 'general' }),
    ],
  },

  'Storage Devices': {
    classId: 146,
    name: 'Storage Devices',
    displayLabel: 'Storage Device (NVMe / SSD / HDD)',
    category: 'Storage',
    wsRoutePrefix: '/storagedev',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'serial_number', 'drive_id'],
    fields: [
      textField('drive_name', 'Drive Name', { searchable: true, section: 'general' }),
      textField('drive_id', 'Drive ID', { searchable: true, section: 'hardware' }),
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'Server BMC IP', { searchable: true, section: 'network' }),
      textField('controller_id', 'Controller ID', { searchable: true, section: 'hardware' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('capacity_bytes', 'Capacity (Bytes)', { section: 'hardware' }),
      textField('media_type', 'Media Type', { searchable: true, section: 'hardware', placeholder: 'SSD / NVMe / HDD' }),
      textField('protocol', 'Protocol', { searchable: true, section: 'hardware', placeholder: 'NVMe / SAS / SATA' }),
      textField('revision', 'Firmware Revision', { section: 'hardware' }),
      textField('failure_predicted', 'Failure Predicted', { section: 'general', placeholder: 'false' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'Storage Controller': {
    classId: 145,
    name: 'Storage Controller',
    displayLabel: 'Storage Controller',
    category: 'Storage',
    wsRoutePrefix: '/storagectrl',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'controller_id', 'serial_number'],
    fields: [
      textField('controller_name', 'Controller Name', { searchable: true, section: 'general' }),
      textField('controller_id', 'Controller ID', { searchable: true, section: 'hardware' }),
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'Server BMC IP', { searchable: true, section: 'network' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('firmware_version', 'Firmware Version', { section: 'hardware' }),
      textField('supported_protocols', 'Supported Protocols', { section: 'hardware' }),
      textField('speed_gbps', 'Speed (Gbps)', { section: 'hardware' }),
      textField('drives_attached', 'Drives Attached', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'BMC Manager': {
    classId: 140,
    name: 'BMC Manager',
    displayLabel: 'BMC / iDRAC / iLO Manager',
    category: 'Compute & Blades',
    wsRoutePrefix: '/bmcmanager',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['bmc_ip', 'hostname', 'serial_number'],
    fields: [
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('hostname', 'Hostname', { searchable: true, section: 'general' }),
      textField('manager_type', 'Manager Type', { searchable: true, section: 'hardware', placeholder: 'BMC / iDRAC / OpenBMC' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('firmware_version', 'Firmware Version', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('uuid', 'UUID', { searchable: true, section: 'hardware' }),
      textField('power_state', 'Power State', { searchable: true, section: 'general' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'Processors Info': {
    classId: 142,
    name: 'Processors Info',
    displayLabel: 'Processor (CPU)',
    category: 'Server Components',
    wsRoutePrefix: '/processors',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'model', 'serial_number'],
    fields: [
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('socket', 'CPU Socket', { searchable: true, section: 'hardware' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('model', 'Processor Model', { searchable: true, section: 'hardware' }),
      textField('processor_type', 'Processor Type', { section: 'hardware' }),
      textField('processor_architecture', 'Architecture', { section: 'hardware' }),
      textField('instruction_set', 'Instruction Set', { section: 'hardware' }),
      textField('total_cores', 'Total Cores', { section: 'hardware' }),
      textField('total_threads', 'Total Threads', { section: 'hardware' }),
      textField('max_speed_mhz', 'Max Speed (MHz)', { section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  Memory: {
    classId: 143,
    name: 'Memory',
    displayLabel: 'Memory DIMM',
    category: 'Server Components',
    wsRoutePrefix: '/memory',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'dimm_slot', 'serial_number'],
    fields: [
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('dimm_slot', 'DIMM Slot', { searchable: true, section: 'hardware' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('memory_device_type', 'Memory Type', { searchable: true, section: 'hardware', placeholder: 'DDR4 / DDR5' }),
      textField('capacity_mib', 'Capacity (MiB)', { section: 'hardware' }),
      textField('operating_speed_mhz', 'Speed (MHz)', { section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('data_width_bits', 'Data Width (Bits)', { section: 'hardware' }),
      textField('rank_count', 'Rank Count', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'GPUs Info': {
    classId: 144,
    name: 'GPUs Info',
    displayLabel: 'GPU Accelerator',
    category: 'Server Components',
    wsRoutePrefix: '/gpus',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'model', 'serial_number'],
    fields: [
      textField('name', 'GPU Name', { searchable: true, section: 'general' }),
      textField('gpu_id', 'GPU ID', { searchable: true, section: 'hardware' }),
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('firmware_version', 'Firmware Version', { section: 'hardware' }),
      textField('device_type', 'Device Type', { section: 'hardware' }),
      textField('pcie_type', 'PCIe Type', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'Power Supply Units Info': {
    classId: 147,
    name: 'Power Supply Units Info',
    displayLabel: 'Power Supply Unit (PSU)',
    category: 'Server Components',
    wsRoutePrefix: '/psu',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'psu_id', 'serial_number'],
    fields: [
      textField('psu_name', 'PSU Name', { searchable: true, section: 'general' }),
      textField('psu_id', 'PSU ID', { searchable: true, section: 'hardware' }),
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('manufacturer', 'Manufacturer', { searchable: true, section: 'hardware' }),
      textField('model', 'Model', { searchable: true, section: 'hardware' }),
      textField('serial_number', 'Serial Number', { searchable: true, section: 'hardware' }),
      textField('part_number', 'Part Number', { section: 'hardware' }),
      textField('power_capacity_watts', 'Capacity (Watts)', { section: 'hardware' }),
      textField('input_type', 'Input Type', { section: 'hardware' }),
      textField('firmware_version', 'Firmware Version', { section: 'hardware' }),
      textField('hotpluggable', 'Hotpluggable', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  Fans: {
    classId: 148,
    name: 'Fans',
    displayLabel: 'Cooling Fan',
    category: 'Server Components',
    wsRoutePrefix: '/fans',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'fan_id', 'fan_name'],
    fields: [
      textField('fan_name', 'Fan Name', { searchable: true, section: 'general' }),
      textField('fan_id', 'Fan ID', { searchable: true, section: 'hardware' }),
      textField('hostname', 'Server Hostname', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'BMC IP', { searchable: true, section: 'network' }),
      textField('physical_context', 'Physical Context', { section: 'hardware' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  'NIC Ethernet Interfaces': {
    classId: 149,
    name: 'NIC Ethernet Interfaces',
    displayLabel: 'NIC Ethernet Interface',
    category: 'Server Components',
    wsRoutePrefix: '/nic',
    hasDedicatedWsRoute: true,
    primarySearchKeys: ['hostname', 'mac_address', 'interface_id'],
    fields: [
      textField('name', 'Interface Name', { searchable: true, section: 'network' }),
      textField('interface_id', 'Interface ID', { searchable: true, section: 'network' }),
      textField('hostname', 'Host / Switch Name', { searchable: true, section: 'general' }),
      textField('bmc_ip', 'Host BMC IP', { searchable: true, section: 'network' }),
      textField('mac_address', 'MAC Address', { searchable: true, section: 'network' }),
      textField('speed_mbps', 'Speed (Mbps)', { section: 'network' }),
      textField('link_status', 'Link Status', { searchable: true, section: 'network', placeholder: 'LinkUp / LinkDown' }),
      textField('full_duplex', 'Full Duplex', { section: 'network' }),
      textField('interface_enabled', 'Interface Enabled', { section: 'network' }),
      textField('health', 'Health', { searchable: true, section: 'general' }),
      textField('state', 'State', { searchable: true, section: 'general' }),
      dateTimeField('last_collected', 'Last Collected', { searchable: true, section: 'general' }),
    ],
  },

  Computer: {
    classId: 22,
    name: 'Computer',
    displayLabel: 'Computer / Workstation / VM',
    category: 'ITSM Standard Assets',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['FQDN', 'SerialNumber', 'Vendor'],
    fields: [
      catalogField('Type', 'Computer Type', 'ITSM::ConfigItem::Computer::Type', { section: 'general' }),
      textField('FQDN', 'FQDN / Hostname', { searchable: true, maxLength: 100, section: 'network', placeholder: 'vm-app01.atlancis.local' }),
      textField('Vendor', 'Vendor / Hypervisor', { searchable: true, maxLength: 50, section: 'hardware', placeholder: 'Dell / VMware / KVM' }),
      textField('Model', 'Model / VM Flavor', { searchable: true, maxLength: 50, section: 'hardware' }),
      textField('SerialNumber', 'Serial Number / VM UUID', { searchable: true, maxLength: 100, section: 'hardware' }),
      textField('OperatingSystem', 'Operating System', { maxLength: 100, section: 'hardware', placeholder: 'Ubuntu 24.04 LTS / RHEL 9' }),
      textField('CPU', 'Processor / vCPU', { maxLength: 100, section: 'hardware' }),
      textField('Ram', 'RAM', { maxLength: 100, section: 'hardware' }),
      {
        key: 'HardDisk',
        label: 'Hard Disk / Storage Device',
        type: 'Text',
        maxLength: 100,
        section: 'hardware',
        subFields: [{ key: 'Capacity', label: 'Storage Capacity', type: 'Text', maxLength: 10 }],
      },
      {
        key: 'NIC',
        label: 'Network Adapter',
        type: 'Text',
        maxLength: 100,
        section: 'network',
        subFields: [
          {
            key: 'IPoverDHCP',
            label: 'IP over DHCP',
            type: 'GeneralCatalog',
            catalogClass: 'ITSM::ConfigItem::YesNo',
            options: ['No', 'Yes'],
          },
          { key: 'IPAddress', label: 'IP Address', type: 'Text', maxLength: 40, searchable: true },
        ],
      },
      textField('GraphicAdapter', 'Graphic Adapter', { maxLength: 100, section: 'hardware' }),
      textField('CustomerID', 'Customer Company ID', { searchable: true, section: 'ownership' }),
      textField('Owner', 'Owner (Customer Login)', { searchable: true, section: 'ownership' }),
      dateField('InstallDate', 'Install Date', { section: 'general' }),
      dateField('WarrantyExpirationDate', 'Warranty Expiration Date', { section: 'general' }),
      textAreaField('Description', 'Description', { section: 'general' }),
      textAreaField('Note', 'Notes / Location Info', { section: 'location' }),
    ],
  },

  Hardware: {
    classId: 23,
    name: 'Hardware',
    displayLabel: 'Network Device / Generic Hardware',
    category: 'ITSM Standard Assets',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['Vendor', 'Model', 'SerialNumber'],
    fields: [
      catalogField('Type', 'Device Type', 'ITSM::ConfigItem::Hardware::Type', { section: 'general' }),
      textField('Vendor', 'Vendor', { searchable: true, maxLength: 50, section: 'hardware' }),
      textField('Model', 'Model', { searchable: true, maxLength: 50, section: 'hardware' }),
      textField('SerialNumber', 'Serial Number', { searchable: true, maxLength: 100, section: 'hardware' }),
      textField('CustomerID', 'Customer Company ID', { searchable: true, section: 'ownership' }),
      textField('Owner', 'Owner (Customer Login)', { searchable: true, section: 'ownership' }),
      dateField('InstallDate', 'Install Date', { section: 'general' }),
      dateField('WarrantyExpirationDate', 'Warranty Expiration Date', { section: 'general' }),
      textAreaField('Description', 'Description (Mgmt IP / MAC / Port Info)', { section: 'network' }),
      textAreaField('Note', 'Location / Rack Notes', { section: 'location' }),
    ],
  },

  Location: {
    classId: 24,
    name: 'Location',
    displayLabel: 'Location / Site / Rack',
    category: 'Power & Facilities',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['Type', 'Address'],
    fields: [
      catalogField('Type', 'Location Type', 'ITSM::ConfigItem::Location::Type', { section: 'general' }),
      textAreaField('Address', 'Physical Address', { section: 'location' }),
      textField('Phone1', 'Primary Phone', { maxLength: 100, section: 'general' }),
      textField('Phone2', 'Secondary Phone', { maxLength: 100, section: 'general' }),
      textField('E-Mail', 'Contact E-Mail', { maxLength: 100, section: 'general' }),
      textField('CustomerID', 'Customer Company ID', { searchable: true, section: 'ownership' }),
      textField('Owner', 'Owner', { searchable: true, section: 'ownership' }),
      textAreaField('Note', 'Notes', { section: 'general' }),
    ],
  },

  Network: {
    classId: 25,
    name: 'Network',
    displayLabel: 'Network Subnet / Segment',
    category: 'Network Infrastructure',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['NetworkAddress', 'Type'],
    fields: [
      catalogField('Type', 'Network Type', 'ITSM::ConfigItem::Network::Type', { section: 'network' }),
      {
        key: 'NetworkAddress',
        label: 'Network Address',
        type: 'Text',
        searchable: true,
        maxLength: 20,
        section: 'network',
        subFields: [
          { key: 'SubnetMask', label: 'Subnet Mask', type: 'Text', maxLength: 20 },
          { key: 'Gateway', label: 'Gateway IP', type: 'Text', maxLength: 20 },
        ],
      },
      textField('CustomerID', 'Customer Company ID', { searchable: true, section: 'ownership' }),
      textField('Owner', 'Owner', { searchable: true, section: 'ownership' }),
      textAreaField('Description', 'Description', { section: 'general' }),
      textAreaField('Note', 'Location / VLAN Notes', { section: 'location' }),
    ],
  },

  Software: {
    classId: 26,
    name: 'Software',
    displayLabel: 'Software / Application',
    category: 'Software & Licences',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['Vendor', 'Version', 'SerialNumber'],
    fields: [
      catalogField('Type', 'Software Type', 'ITSM::ConfigItem::Software::Type', { section: 'general' }),
      textField('Vendor', 'Vendor', { searchable: true, maxLength: 50, section: 'general' }),
      textField('Version', 'Version', { searchable: true, maxLength: 50, section: 'general' }),
      textField('SerialNumber', 'Serial Number', { searchable: true, maxLength: 50, section: 'general' }),
      catalogField('LicenceType', 'Licence Type', 'ITSM::ConfigItem::Software::LicenceType', { section: 'ownership' }),
      {
        key: 'LicenceKey',
        label: 'Licence Key',
        type: 'Text',
        searchable: true,
        maxLength: 50,
        section: 'ownership',
        subFields: [
          { key: 'Quantity', label: 'Seat Quantity', type: 'Integer', min: 1, max: 1000 },
          { key: 'ExpirationDate', label: 'Expiration Date', type: 'Date' },
        ],
      },
      textField('Media', 'Installation Media', { maxLength: 20, section: 'general' }),
      textField('CustomerID', 'Customer Company ID', { searchable: true, section: 'ownership' }),
      textField('Owner', 'Owner', { searchable: true, section: 'ownership' }),
      textAreaField('Description', 'Description', { section: 'general' }),
      textAreaField('Note', 'Notes', { section: 'general' }),
    ],
  },

  Licence: {
    classId: 154,
    name: 'Licence',
    displayLabel: 'Enterprise Licence',
    category: 'Software & Licences',
    wsRoutePrefix: '/servers',
    hasDedicatedWsRoute: false,
    primarySearchKeys: ['ProjectName', 'Vendor', 'SerialNumber'],
    fields: [
      textField('ProjectName', 'Project Name', { searchable: true, maxLength: 100, section: 'general' }),
      textField('Vendor', 'Vendor', { searchable: true, maxLength: 50, section: 'general' }),
      textField('SKU', 'SKU (Stock Keeping Unit)', { searchable: true, maxLength: 100, section: 'general' }),
      textField('Version', 'Version', { searchable: true, maxLength: 50, section: 'general' }),
      catalogField('Status', 'Licence Status', 'ITSM::ConfigItem::Licence::Status', { section: 'general' }),
      catalogField('LicenceType', 'Licence Type', 'ITSM::ConfigItem::Software::LicenceType', { section: 'ownership' }),
      textField('SerialNumber', 'Serial Number', { searchable: true, required: true, maxLength: 50, section: 'general' }),
      { key: 'Quantity', label: 'Quantity', type: 'Integer', searchable: true, min: 1, max: 1000, section: 'ownership' },
      dateField('PurchaseDate', 'Purchase Date', { section: 'ownership' }),
      dateField('InstallationDate', 'Installation Date', { section: 'general' }),
      dateField('ExpiryDate', 'Expiry Date', { section: 'ownership' }),
      textField('ContractTerm', 'Contract Term', { searchable: true, maxLength: 100, section: 'ownership' }),
      catalogField('TaxCompliance', 'Tax Compliance', 'ITSM::ConfigItem::YesNo', { section: 'ownership' }),
      textField('CustomerID', 'Customer Company ID', { searchable: true, section: 'ownership' }),
      textField('Owner', 'Owner', { searchable: true, section: 'ownership' }),
      textField('Media', 'Media', { maxLength: 20, section: 'general' }),
      textAreaField('Description', 'Description', { section: 'general' }),
      textAreaField('Note', 'Notes', { section: 'general' }),
    ],
  },
};

/**
 * Guided Creation Templates requested by IT Operations (Computer, Server, Network Device,
 * Switch, Access Point, Chassis, Circuit, Storage Device, Software, Virtual Machine)
 * mapped cleanly onto real Znuny CMDB classes and pre-populated defaults.
 */
const CREATION_TEMPLATES = [
  { key: 'Servers', label: 'Server (Physical / Compute)', targetClass: 'Servers', defaults: { state: 'Enabled', health: 'OK', power_state: 'On' } },
  {
    key: 'VirtualMachine',
    label: 'Virtual Machine',
    targetClass: 'Computer',
    defaults: { Type: 'Server', Vendor: 'KVM / OpenStack', IPoverDHCP: 'No' },
    description: 'Stored under Znuny "Computer" class (Type = Server) with vCPU, RAM, Storage, OS, FQDN & NIC IP.',
  },
  { key: 'Computer', label: 'Computer / Workstation', targetClass: 'Computer', defaults: { Type: 'Desktop', IPoverDHCP: 'Yes' } },
  {
    key: 'NetworkDevice',
    label: 'Network Device (Router / Appliance)',
    targetClass: 'Hardware',
    defaults: { Type: 'Router' },
    description: 'Stored under Znuny "Hardware" class with Device Type, Vendor, Model, Serial Number & Management details.',
  },
  { key: 'Switch', label: 'Switch', targetClass: 'Switch', defaults: { health: 'OK', device_role: 'Leaf' } },
  { key: 'Firewall', label: 'Firewall', targetClass: 'Firewall', defaults: { health: 'OK', ha_mode: 'Active-Passive' } },
  { key: 'Access Point', label: 'Access Point', targetClass: 'Access Point', defaults: { unit_of_measure: 'Pc' } },
  { key: 'Chassis Info', label: 'Chassis', targetClass: 'Chassis Info', defaults: { health: 'OK', state: 'Enabled', chassis_type: 'Enclosure' } },
  { key: 'Circuits', label: 'Circuit', targetClass: 'Circuits', defaults: { alive: 'true', amp_state: 'normal' } },
  { key: 'PDU', label: 'PDU', targetClass: 'PDU', defaults: { alive: 'true' } },
  { key: 'Outlets', label: 'PDU Outlet', targetClass: 'Outlets', defaults: { amp_state: 'normal', relay_state: 'on' } },
  { key: 'Storage Devices', label: 'Storage Device', targetClass: 'Storage Devices', defaults: { health: 'OK', state: 'Enabled', media_type: 'NVMe' } },
  { key: 'Storage Controller', label: 'Storage Controller', targetClass: 'Storage Controller', defaults: { health: 'OK', state: 'Enabled' } },
  { key: 'Software', label: 'Software / Application', targetClass: 'Software', defaults: { Type: 'Server Application' } },
  { key: 'Licence', label: 'Enterprise Licence', targetClass: 'Licence', defaults: { Status: 'Active', TaxCompliance: 'Yes', Quantity: 1 } },
  { key: 'Location', label: 'Location / Site / Rack', targetClass: 'Location', defaults: { Type: 'Rack' } },
];

// Default classes queried for main CMDB Inventory overview (excludes granular per-DIMM/per-Fan noise unless filtered, or fetches core infra first)
const PRIMARY_INFRA_CLASSES = [
  'Servers',
  'Switch',
  'Firewall',
  'Access Point',
  'Chassis Info',
  'PDU',
  'Circuits',
  'Storage Devices',
  'Storage Controller',
  'BMC Manager',
  'Licence',
  'Hardware',
  'Location',
  'Computer',
  'Network',
  'Software',
];

const COMPONENT_CLASSES = ['Outlets', 'Processors Info', 'Memory', 'GPUs Info', 'Power Supply Units Info', 'Fans', 'NIC Ethernet Interfaces'];

const BUILTIN_CLASS_NAMES = new Set(Object.keys(CMDB_CLASSES));
const PERSISTED_CUSTOM_SCHEMAS = new Map();

function hydrateFieldCatalogOptions(fields = []) {
  return fields.map((f) => {
    const hydrated = { ...f };
    if (hydrated.type === 'GeneralCatalog' && hydrated.catalogClass && !Array.isArray(hydrated.options)) {
      hydrated.options = GENERAL_CATALOGS[hydrated.catalogClass] || ['Yes', 'No'];
    }
    if (Array.isArray(hydrated.subFields)) {
      hydrated.subFields = hydrateFieldCatalogOptions(hydrated.subFields);
    }
    return hydrated;
  });
}

function savePersistedCustomClasses() {
  try {
    const dir = path.dirname(CUSTOM_CLASSES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const obj = Object.fromEntries(PERSISTED_CUSTOM_SCHEMAS.entries());
    const tmp = `${CUSTOM_CLASSES_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), classes: obj }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, CUSTOM_CLASSES_FILE);
  } catch (_err) {
    // Non-fatal
  }
}

function registerClassSchema(schemaDef, { persist = true } = {}) {
  if (!schemaDef || !schemaDef.name) return null;
  const existing = CMDB_CLASSES[schemaDef.name] || {};
  const isBuiltin = BUILTIN_CLASS_NAMES.has(schemaDef.name);

  const normalized = {
    classId: Number(schemaDef.classId || existing.classId || 0),
    name: schemaDef.name,
    displayLabel: schemaDef.displayLabel || existing.displayLabel || schemaDef.name,
    category: schemaDef.category || existing.category || 'Custom Infrastructure',
    wsRoutePrefix: existing.wsRoutePrefix || schemaDef.wsRoutePrefix || '/servers',
    hasDedicatedWsRoute: Boolean(existing.hasDedicatedWsRoute || schemaDef.hasDedicatedWsRoute),
    origin: isBuiltin ? (schemaDef.definitionVersion ? 'builtin_modified' : 'builtin') : schemaDef.origin || 'custom',
    definitionVersion: schemaDef.definitionVersion || existing.definitionVersion || 1,
    rawYaml: schemaDef.rawYaml || existing.rawYaml || '',
    primarySearchKeys:
      schemaDef.primarySearchKeys ||
      existing.primarySearchKeys ||
      (schemaDef.fields || []).filter((f) => f.searchable).slice(0, 3).map((f) => f.key),
    fields: hydrateFieldCatalogOptions(schemaDef.fields || existing.fields || []),
  };

  CMDB_CLASSES[normalized.name] = normalized;

  if (!PRIMARY_INFRA_CLASSES.includes(normalized.name) && !COMPONENT_CLASSES.includes(normalized.name)) {
    PRIMARY_INFRA_CLASSES.push(normalized.name);
  }

  // Register a guided creation template for newly added classes so they appear at the top of Create CI
  if (!CREATION_TEMPLATES.some((t) => t.targetClass === normalized.name)) {
    CREATION_TEMPLATES.unshift({
      key: normalized.name,
      label: normalized.displayLabel,
      targetClass: normalized.name,
      defaults: {},
      description: schemaDef.description || `Custom Znuny CMDB class "${normalized.name}"`,
    });
  }

  if (persist) {
    PERSISTED_CUSTOM_SCHEMAS.set(normalized.name, normalized);
    savePersistedCustomClasses();
  }

  return normalized;
}

function loadPersistedCustomClassesOnStartup() {
  try {
    if (!fs.existsSync(CUSTOM_CLASSES_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(CUSTOM_CLASSES_FILE, 'utf8'));
    if (!parsed || typeof parsed.classes !== 'object') return;
    for (const schema of Object.values(parsed.classes)) {
      if (schema && schema.name) {
        PERSISTED_CUSTOM_SCHEMAS.set(schema.name, schema);
        registerClassSchema(schema, { persist: false });
      }
    }
  } catch (_err) {
    // Ignore invalid file
  }
}

loadPersistedCustomClassesOnStartup();

module.exports = {
  DEPLOYMENT_STATES,
  INCIDENT_STATES,
  GENERAL_CATALOGS,
  CMDB_CLASSES,
  CREATION_TEMPLATES,
  PRIMARY_INFRA_CLASSES,
  COMPONENT_CLASSES,
  BUILTIN_CLASS_NAMES,
  registerClassSchema,
};
