/**
 * Stateful, realistic Atlancis IT Operations Demo Store
 * Used ONLY when operating in Demo Mode (`mode === 'demo'`).
 * Mirrors the exact real Znuny 6.5.1 classes, queues, priorities, SLAs, and Athi OCP / Network topology.
 */

const { normalizeZnunyCI, buildZnunyCIXMLData } = require('./cmdbTransformer');

let nextCiId = 3100;
let nextTicketId = 2100;
let nextArticleId = 31000;
let nextRelId = 900;

const DEMO_QUEUES = {
  1: 'Server',
  36: 'Network',
  37: 'Storage',
  38: 'Security',
  39: 'Virtualization',
  40: 'Software',
  41: 'Database',
  42: 'Inbound Mail',
  44: 'DevOps Department',
  46: 'EBU Department',
  55: 'Cloud Platform::Internal Security Department',
  65: 'Admin Queue',
  66: 'Cloud Platform',
  67: 'Servenah Cloud',
  70: 'Technical Inquiries',
};

const DEMO_PRIORITIES = {
  1: '1 Low',
  2: '2 Minor',
  3: '3 Major',
  4: '4 Critical',
};

const DEMO_SERVICES = {
  11: 'Application_Support',
  12: 'KPLC Oracle M8',
  18: 'Commercial bank of Africa (CBA) Kenya',
  19: 'Judicial Service Commission',
  57: 'Servenah Cloud Compute',
  58: 'Athi OCP Colocation & Managed Infra',
  59: 'Enterprise MPLS & Connectivity',
};

const DEMO_SLAS = [
  {
    SLAID: 8,
    Name: 'Critical SLA',
    Type: 'Availability',
    CalendarName: 'Calendar 1 - Atlancis 2026 (24x7)',
    FirstResponseTime: 15,
    UpdateTime: 30,
    SolutionTime: 120,
    Services: ['Servenah Cloud Compute', 'Athi OCP Colocation & Managed Infra'],
  },
  {
    SLAID: 9,
    Name: 'Enterprise Gold SLA',
    Type: 'Response Time',
    CalendarName: 'Calendar 1 - Atlancis 2026',
    FirstResponseTime: 30,
    UpdateTime: 60,
    SolutionTime: 240,
    Services: ['Commercial bank of Africa (CBA) Kenya', 'KPLC Oracle M8'],
  },
  {
    SLAID: 10,
    Name: 'Standard Operations SLA',
    Type: 'Resolution Rate',
    CalendarName: 'Business Hours EAT',
    FirstResponseTime: 60,
    UpdateTime: 180,
    SolutionTime: 480,
    Services: ['Application_Support', 'Judicial Service Commission', 'Enterprise MPLS & Connectivity'],
  },
];

const DEMO_AGENTS = [
  'David',
  'Julius.Mutai',
  'Njuguna',
  'Peter.Kamundia',
  'Elias',
  'nash.wanjii',
  'Tracy',
  'francis.makumi',
  'brian.koech',
  'Toney.Webala',
  'hussein.kadweka',
  'Vincent-Murimi',
];

function createInitialCIs() {
  const rawList = [
    // Athi OCP Infrastructure: Chassis -> Physical Servers -> Virtual Machines -> Applications
    {
      ConfigItemID: 1001,
      Number: '10141000001',
      Name: 'ATHI-OCP-RACK01-CHASSIS-A',
      Class: 'Chassis Info',
      VersionID: 3,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-03-10 08:00:00',
      ChangeTime: '2026-11-12 14:20:00',
      CIXMLData: {
        name: 'Athi OCP OpenRack V2 Enclosure A',
        hostname: 'athi-ocp-ch01.atlancis.local',
        bmc_ip: '10.10.131.10',
        manufacturer: 'Wiwynn / OCP',
        chassis_model: 'OpenRack v2 21OU',
        chassis_type: 'Enclosure',
        serial_number: 'OCP-ATHI-CH001',
        asset_tag: 'ATL-DC1-CH01',
        health: 'OK',
        state: 'Enabled',
        last_collected: '2026-11-13 08:45:00',
      },
    },
    {
      ConfigItemID: 1002,
      Number: '10139000001',
      Name: 'ATHI-OCP-SRV-NODE01',
      Class: 'Servers',
      VersionID: 5,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-03-12 09:15:00',
      ChangeTime: '2026-11-13 08:45:00',
      CIXMLData: {
        hostname: 'athi-ocp-srv01.atlancis.local',
        bmc_ip: '10.10.131.21',
        name: 'Servenah Compute Node 01',
        manufacturer: 'Wiwynn',
        vendor_family: 'OCP Tioga Pass',
        system_model: 'SV7220G3',
        serial_number: 'WWY-TP-992011',
        asset_tag: 'ATL-SRV-001',
        processor_model: '2x Intel Xeon Gold 6338',
        processor_count: '2',
        memory_total_gib: '512',
        bios_version: 'TP3B19',
        power_state: 'On',
        health: 'OK',
        health_rollup: 'OK',
        state: 'Enabled',
        last_collected: '2026-11-13 08:45:00',
      },
    },
    {
      ConfigItemID: 1003,
      Number: '10139000002',
      Name: 'ATHI-OCP-SRV-NODE02',
      Class: 'Servers',
      VersionID: 8,
      CurDeplState: 'Production',
      CurInciState: 'Incident',
      CreateTime: '2026-03-12 09:20:00',
      ChangeTime: '2026-11-13 07:10:00',
      CIXMLData: {
        hostname: 'athi-ocp-srv02.atlancis.local',
        bmc_ip: '10.10.131.22',
        name: 'Servenah Compute Node 02',
        manufacturer: 'Wiwynn',
        vendor_family: 'OCP Tioga Pass',
        system_model: 'SV7220G3',
        serial_number: 'WWY-TP-992012',
        asset_tag: 'ATL-SRV-002',
        processor_model: '2x Intel Xeon Gold 6338',
        processor_count: '2',
        memory_total_gib: '512',
        bios_version: 'TP3B19',
        power_state: 'On',
        health: 'Critical',
        health_rollup: 'Critical',
        state: 'Degraded',
        last_collected: '2026-11-13 07:10:00',
      },
    },
    {
      ConfigItemID: 1004,
      Number: '10139000003',
      Name: 'NBO-DELL-R750-DB01',
      Class: 'Servers',
      VersionID: 4,
      CurDeplState: 'Production',
      CurInciState: 'Warning',
      CreateTime: '2026-04-01 11:00:00',
      ChangeTime: '2026-11-12 22:30:00',
      CIXMLData: {
        hostname: 'nbo-db-r750-01.atlancis.local',
        bmc_ip: '10.20.14.31',
        name: 'Enterprise Banking DB Host 01',
        manufacturer: 'Dell Inc.',
        vendor_family: 'PowerEdge',
        system_model: 'PowerEdge R750',
        serial_number: 'DL-750-KE8812',
        asset_tag: 'ATL-NBO-SRV14',
        processor_model: '2x Intel Xeon Platinum 8358',
        processor_count: '2',
        memory_total_gib: '1024',
        bios_version: '1.13.2',
        power_state: 'On',
        health: 'Warning',
        health_rollup: 'Warning',
        state: 'Enabled',
        last_collected: '2026-11-13 08:30:00',
      },
    },
    {
      ConfigItemID: 1005,
      Number: '10022000001',
      Name: 'VM-SERVENAH-K8S-MASTER01',
      Class: 'Computer',
      VersionID: 2,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-05-18 10:00:00',
      ChangeTime: '2026-11-10 16:00:00',
      CIXMLData: {
        Type: 'Server',
        Vendor: 'KVM / OpenStack',
        Model: 'Virtual Machine (16 vCPU / 64GB)',
        FQDN: 'k8s-master01.servenah.cloud',
        SerialNumber: 'VM-UUID-7781-A01',
        OperatingSystem: 'Ubuntu 24.04.1 LTS',
        CPU: '16 vCPU',
        Ram: '64 GB',
        HardDisk: [{ HardDisk: 'vda-ceph-ssd', Capacity: '500GB' }],
        NIC: [{ NIC: 'ens3', IPoverDHCP: 'No', IPAddress: '172.16.40.11' }],
        CustomerID: 'Servenah Cloud',
        Owner: 'DevOps Department',
        InstallDate: '2026-05-18',
        Note: 'Athi River DC1 - Hosted on ATHI-OCP-SRV-NODE01',
      },
    },
    {
      ConfigItemID: 1006,
      Number: '10022000002',
      Name: 'VM-CBA-PAYMENTS-GW01',
      Class: 'Computer',
      VersionID: 3,
      CurDeplState: 'Production',
      CurInciState: 'Warning',
      CreateTime: '2026-06-02 09:00:00',
      ChangeTime: '2026-11-13 07:25:00',
      CIXMLData: {
        Type: 'Server',
        Vendor: 'KVM / OpenStack',
        Model: 'Virtual Machine (8 vCPU / 32GB)',
        FQDN: 'payments-gw01.cba.atlancis.cloud',
        SerialNumber: 'VM-UUID-8842-B02',
        OperatingSystem: 'RHEL 9.4',
        CPU: '8 vCPU',
        Ram: '32 GB',
        HardDisk: [{ HardDisk: 'vda-nvme', Capacity: '300GB' }],
        NIC: [{ NIC: 'ens3', IPoverDHCP: 'No', IPAddress: '172.16.52.20' }],
        CustomerID: 'Commercial bank of Africa (CBA) Kenya',
        Owner: 'EBU Department',
        InstallDate: '2026-06-02',
        Note: 'Athi River DC1 - Hosted on ATHI-OCP-SRV-NODE02',
      },
    },
    {
      ConfigItemID: 1007,
      Number: '10026000001',
      Name: 'APP-SERVENAH-BILLING-API',
      Class: 'Software',
      VersionID: 2,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-06-15 12:00:00',
      ChangeTime: '2026-11-05 09:30:00',
      CIXMLData: {
        Type: 'Server Application',
        Vendor: 'Atlancis Cloud Engineering',
        Version: 'v4.8.2',
        SerialNumber: 'SW-SRV-BILL-01',
        LicenceType: 'Internal',
        CustomerID: 'Servenah Cloud',
        Owner: 'Cloud Platform',
        Description: 'Core Servenah cloud metering & billing microservice running on k8s-master01',
        Note: 'Athi River DC1',
      },
    },
    // Network Infrastructure: Core Switch -> Access Points / Firewalls / Circuits
    {
      ConfigItemID: 1008,
      Number: '10150000001',
      Name: 'ATHI-CORE-SW01',
      Class: 'Switch',
      VersionID: 4,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-02-20 10:00:00',
      ChangeTime: '2026-11-13 08:50:00',
      CIXMLData: {
        hostname: 'athi-core-sw01.atlancis.local',
        mgmt_ip: '10.10.1.2',
        loopback_ip: '10.255.0.1',
        base_mac: 'B8:6A:97:11:20:01',
        vendor: 'Edgecore',
        model: 'AS7726-32X',
        product_name: 'Edgecore 32x100GbE Spine Switch',
        serial_number: 'EC-7726-ATHI01',
        os_family: 'SONiC',
        os_version: '202511.2',
        asic: 'Broadcom Trident3',
        port_count: '32',
        device_role: 'Core Spine',
        site: 'Athi River DC1',
        uptime: '214 days, 06:12:44',
        health: 'OK',
        last_collected: '2026-11-13 08:50:00',
      },
    },
    {
      ConfigItemID: 1009,
      Number: '10150000002',
      Name: 'TOPPLAZA-DIST-SW01',
      Class: 'Switch',
      VersionID: 3,
      CurDeplState: 'Production',
      CurInciState: 'Warning',
      CreateTime: '2026-03-01 13:00:00',
      ChangeTime: '2026-11-13 06:40:00',
      CIXMLData: {
        hostname: 'topplaza-dist-sw01.atlancis.local',
        mgmt_ip: '10.30.1.5',
        loopback_ip: '10.255.0.15',
        base_mac: '00:1C:73:AA:44:10',
        vendor: 'Arista',
        model: 'DCS-7050SX3-48YC8',
        product_name: 'Arista 7050X3 Distribution Switch',
        serial_number: 'ARI-7050-TP01',
        os_family: 'EOS',
        os_version: '4.31.2F',
        port_count: '56',
        device_role: 'Distribution',
        site: 'Top Plaza HQ',
        uptime: '89 days, 14:22:10',
        health: 'Warning',
        last_collected: '2026-11-13 08:40:00',
      },
    },
    {
      ConfigItemID: 1010,
      Number: '10151000001',
      Name: 'ATHI-EDGE-FW01',
      Class: 'Firewall',
      VersionID: 3,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-02-22 15:00:00',
      ChangeTime: '2026-11-13 08:50:00',
      CIXMLData: {
        hostname: 'athi-edge-fw01.atlancis.local',
        mgmt_ip: '10.10.0.1',
        vendor: 'Fortinet',
        model: 'FortiGate 1800F',
        serial_number: 'FG180FTK22900411',
        os_family: 'FortiOS',
        os_version: 'v7.4.5',
        ha_mode: 'Active-Passive',
        operation_mode: 'NAT',
        device_role: 'Perimeter Firewall',
        site: 'Athi River DC1',
        uptime: '192 days, 11:05:00',
        health: 'OK',
        last_collected: '2026-11-13 08:50:00',
      },
    },
    {
      ConfigItemID: 1011,
      Number: '10152000001',
      Name: 'AP-TOPPLAZA-FL4-EAST',
      Class: 'Access Point',
      VersionID: 2,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-07-10 09:30:00',
      ChangeTime: '2026-10-14 11:20:00',
      CIXMLData: {
        mac_address: '74:83:C2:91:4A:08',
        manufacturer: 'Ubiquiti',
        model: 'UniFi U6 Enterprise',
        project: 'Atlancis Campus Wi-Fi',
        location: 'Top Plaza HQ - 4th Floor',
        owner: 'Network Team',
        unit_of_measure: 'Pc',
        closing_stock: '1',
        stock_date: '2026-07-10',
        remarks: 'Uplinked to TOPPLAZA-DIST-SW01 PoE Port Gi1/0/24',
      },
    },
    {
      ConfigItemID: 1012,
      Number: '10152000002',
      Name: 'AP-MAWINGU-KU-SECTOR03',
      Class: 'Access Point',
      VersionID: 1,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-08-01 14:00:00',
      ChangeTime: '2026-10-20 09:00:00',
      CIXMLData: {
        mac_address: '00:04:56:E8:12:C4',
        manufacturer: 'Cambium Networks',
        model: 'ePMP 3000 Sector',
        project: 'KU/Mawingu',
        location: 'Kenyatta Univ Mast B',
        owner: 'Field Operations',
        unit_of_measure: 'Pc',
        closing_stock: '1',
        stock_date: '2026-08-01',
      },
    },
    // Power & Storage & Licences & Retired
    {
      ConfigItemID: 1013,
      Number: '10136000001',
      Name: 'ATHI-RACK01-PDU-A',
      Class: 'PDU',
      VersionID: 2,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-03-10 08:10:00',
      ChangeTime: '2026-11-13 08:45:00',
      CIXMLData: {
        pdu_ip: '10.10.132.11',
        name: 'Rack 01 Smart PDU Feed A',
        serial_no: 'APC-PDU-88101',
        model: 'APC AP8886 3-Phase',
        alive: 'true',
      },
    },
    {
      ConfigItemID: 1014,
      Number: '10137000001',
      Name: 'ATHI-PDU-A-CIRCUIT-L1',
      Class: 'Circuits',
      VersionID: 2,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-03-10 08:12:00',
      ChangeTime: '2026-11-13 08:45:00',
      CIXMLData: {
        pdu_ip: '10.10.132.11',
        circuit_index: '1',
        name: 'Breaker L1-L2 (Rack 01 Compute)',
        alive: 'true',
        rated_amp: '32',
        rated_volt: '240',
        amp_state: 'normal',
        alarm: '0',
      },
    },
    {
      ConfigItemID: 1015,
      Number: '10146000001',
      Name: 'NVME-NODE02-BAY04',
      Class: 'Storage Devices',
      VersionID: 4,
      CurDeplState: 'Production',
      CurInciState: 'Incident',
      CreateTime: '2026-03-12 09:25:00',
      ChangeTime: '2026-11-13 07:08:00',
      CIXMLData: {
        drive_name: 'NVMe SSD Bay 04',
        drive_id: 'Disk.Bay.4',
        hostname: 'athi-ocp-srv02.atlancis.local',
        bmc_ip: '10.10.131.22',
        controller_id: 'NVMeCtrl0',
        manufacturer: 'Samsung',
        model: 'PM9A3 3.84TB U.2',
        serial_number: 'S64GNX0T409912',
        capacity_bytes: '3840755982336',
        media_type: 'SSD',
        protocol: 'NVMe',
        failure_predicted: 'true',
        health: 'Critical',
        state: 'PredictedFailure',
        last_collected: '2026-11-13 07:08:00',
      },
    },
    {
      ConfigItemID: 1016,
      Number: '10154000001',
      Name: 'FORTIGATE-UTM-BUNDLE-2026',
      Class: 'Licence',
      VersionID: 5,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-01-15 10:00:00',
      ChangeTime: '2026-10-08 08:30:00',
      CIXMLData: {
        ProjectName: 'Athi DC Perimeter Security',
        Vendor: 'Fortinet',
        SKU: 'FC-10-F18HF-950-02-12',
        Version: '7.4 Enterprise',
        Status: 'Active',
        LicenceType: 'Enterprise Licence',
        SerialNumber: 'FG-LIC-2026-9918',
        Quantity: 2,
        PurchaseDate: '2026-01-15',
        InstallationDate: '2026-01-20',
        ExpiryDate: '2027-01-19',
        ContractTerm: '12 Months',
        TaxCompliance: 'Yes',
        CustomerID: 'Atlancis Internal',
        Owner: 'Security Team',
        Description: '24x7 FortiCare + FortiGuard UTP Bundle for HA pair',
        Note: 'Athi River DC1',
      },
    },
    {
      ConfigItemID: 1017,
      Number: '10139000067',
      Name: 'LEGACY-DL380G8-NBO04',
      Class: 'Servers',
      VersionID: 6,
      CurDeplState: 'Retired',
      CurInciState: 'Operational',
      CreateTime: '2024-05-10 08:00:00',
      ChangeTime: '2026-09-30 17:00:00',
      CIXMLData: {
        hostname: 'legacy-dl380-04.atlancis.local',
        bmc_ip: '10.20.14.99',
        name: 'Decommissioned Hypervisor 04',
        manufacturer: 'HPE',
        vendor_family: 'ProLiant',
        system_model: 'ProLiant DL380p Gen8',
        serial_number: 'CZJ41902XX',
        processor_model: '2x Xeon E5-2670',
        memory_total_gib: '128',
        power_state: 'Off',
        health: 'OK',
        state: 'Retired',
        last_collected: '2026-09-30 17:00:00',
      },
    },
    {
      ConfigItemID: 1018,
      Number: '10023000002',
      Name: 'NBO-MPLS-CE-RTR01',
      Class: 'Hardware',
      VersionID: 2,
      CurDeplState: 'Production',
      CurInciState: 'Operational',
      CreateTime: '2026-04-12 09:00:00',
      ChangeTime: '2026-11-01 11:15:00',
      CIXMLData: {
        Type: 'Router',
        Vendor: 'Cisco',
        Model: 'ASR 1001-X',
        SerialNumber: 'FXS2310Q19B',
        CustomerID: 'Enterprise MPLS',
        Owner: 'Network Team',
        InstallDate: '2026-04-12',
        WarrantyExpirationDate: '2028-04-12',
        Description: 'Mgmt IP: 10.10.0.5 | WAN Peering Router Athi DC1',
        Note: 'Athi River DC1 - Meet-Me Room Rack 02',
      },
    },
  ];

  return rawList.map((raw) => ({
    ...normalizeZnunyCI(raw),
    versionHistory: [
      {
        versionId: raw.VersionID,
        deplState: raw.CurDeplState,
        inciState: raw.CurInciState,
        changedAt: raw.ChangeTime,
        changedBy: 'znuny.collector',
        note: 'Latest synchronized configuration version',
      },
      ...(raw.VersionID > 1
        ? [
            {
              versionId: raw.VersionID - 1,
              deplState: 'Production',
              inciState: 'Operational',
              changedAt: raw.CreateTime,
              changedBy: 'David',
              note: 'Initial CI baseline registration',
            },
          ]
        : []),
    ],
  }));
}

function createInitialRelationships() {
  return [
    // Athi OCP Hierarchy: Chassis -> Physical Servers -> VMs -> Applications
    { id: 'rel-1', sourceType: 'ITSMConfigItem', sourceId: 1001, targetType: 'ITSMConfigItem', targetId: 1002, linkType: 'Includes', description: 'Sled Slot 1 in OpenRack Enclosure A' },
    { id: 'rel-2', sourceType: 'ITSMConfigItem', sourceId: 1001, targetType: 'ITSMConfigItem', targetId: 1003, linkType: 'Includes', description: 'Sled Slot 2 in OpenRack Enclosure A' },
    { id: 'rel-3', sourceType: 'ITSMConfigItem', sourceId: 1003, targetType: 'ITSMConfigItem', targetId: 1015, linkType: 'Includes', description: 'NVMe Drive Bay 04 installed in Node 02' },
    { id: 'rel-4', sourceType: 'ITSMConfigItem', sourceId: 1002, targetType: 'ITSMConfigItem', targetId: 1005, linkType: 'Includes', description: 'KVM Guest VM running on Node 01' },
    { id: 'rel-5', sourceType: 'ITSMConfigItem', sourceId: 1003, targetType: 'ITSMConfigItem', targetId: 1006, linkType: 'Includes', description: 'KVM Guest VM running on Node 02' },
    { id: 'rel-6', sourceType: 'ITSMConfigItem', sourceId: 1005, targetType: 'ITSMConfigItem', targetId: 1007, linkType: 'Includes', description: 'Application deployed on K8s cluster' },
    // Power chain: PDU -> Circuit -> Chassis
    { id: 'rel-7', sourceType: 'ITSMConfigItem', sourceId: 1013, targetType: 'ITSMConfigItem', targetId: 1014, linkType: 'Includes', description: 'PDU Breaker L1-L2' },
    { id: 'rel-8', sourceType: 'ITSMConfigItem', sourceId: 1014, targetType: 'ITSMConfigItem', targetId: 1001, linkType: 'ConnectedTo', description: 'Primary Power Feed to OpenRack Enclosure A' },
    // Network Hierarchy: Core Switch -> Distribution Switch / Firewall / Router / APs
    { id: 'rel-9', sourceType: 'ITSMConfigItem', sourceId: 1008, targetType: 'ITSMConfigItem', targetId: 1010, linkType: 'ConnectedTo', description: '100GbE Northbound Trunk to Perimeter FW' },
    { id: 'rel-10', sourceType: 'ITSMConfigItem', sourceId: 1008, targetType: 'ITSMConfigItem', targetId: 1018, linkType: 'ConnectedTo', description: 'MPLS WAN Edge Uplink' },
    { id: 'rel-11', sourceType: 'ITSMConfigItem', sourceId: 1008, targetType: 'ITSMConfigItem', targetId: 1009, linkType: 'ConnectedTo', description: 'Dark Fiber Inter-Site Trunk to Top Plaza HQ' },
    { id: 'rel-12', sourceType: 'ITSMConfigItem', sourceId: 1009, targetType: 'ITSMConfigItem', targetId: 1011, linkType: 'ConnectedTo', description: 'PoE Uplink Gi1/0/24' },
    { id: 'rel-13', sourceType: 'ITSMConfigItem', sourceId: 1008, targetType: 'ITSMConfigItem', targetId: 1002, linkType: 'ConnectedTo', description: '25GbE Leaf Uplink to Compute Node 01' },
    { id: 'rel-14', sourceType: 'ITSMConfigItem', sourceId: 1008, targetType: 'ITSMConfigItem', targetId: 1003, linkType: 'ConnectedTo', description: '25GbE Leaf Uplink to Compute Node 02' },
    { id: 'rel-15', sourceType: 'ITSMConfigItem', sourceId: 1010, targetType: 'ITSMConfigItem', targetId: 1016, linkType: 'DependsOn', description: 'Active FortiGuard Enterprise UTM Licence' },
    // Ticket <-> CI links
    { id: 'rel-16', sourceType: 'Ticket', sourceId: 2001, targetType: 'ITSMConfigItem', targetId: 1003, linkType: 'DependsOn', description: 'Affected compute host' },
    { id: 'rel-17', sourceType: 'Ticket', sourceId: 2001, targetType: 'ITSMConfigItem', targetId: 1015, linkType: 'DependsOn', description: 'Failing NVMe SSD' },
    { id: 'rel-18', sourceType: 'Ticket', sourceId: 2002, targetType: 'ITSMConfigItem', targetId: 1006, linkType: 'DependsOn', description: 'Impacted guest VM experiencing I/O latency' },
    { id: 'rel-19', sourceType: 'Ticket', sourceId: 2003, targetType: 'ITSMConfigItem', targetId: 1009, linkType: 'DependsOn', description: 'Switch port CRC errors on uplink' },
    { id: 'rel-20', sourceType: 'Ticket', sourceId: 2004, targetType: 'ITSMConfigItem', targetId: 1004, linkType: 'DependsOn', description: 'Memory ECC warning threshold reached' },
  ];
}

function createInitialTickets() {
  const now = Date.now();
  const hr = 3600 * 1000;
  const day = 24 * hr;
  const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

  return [
    {
      id: 2001,
      ticketNumber: '202611131000441',
      title: 'CRITICAL: SMART Predictive Failure on NVMe Bay 04 (ATHI-OCP-SRV-NODE02)',
      queue: 'Storage',
      queueId: 37,
      state: 'open',
      stateType: 'open',
      priority: '4 Critical',
      priorityId: 4,
      customer: 'Servenah Cloud',
      customerUser: 'noc-alerts@atlancis.com',
      owner: 'David',
      responsible: 'Julius.Mutai',
      service: 'Athi OCP Colocation & Managed Infra',
      sla: 'Critical SLA',
      slaSolutionMinutes: 120,
      escalationDestinationDate: iso(now + 28 * 60 * 1000), // 28 mins left -> SLA warning!
      escalationSecondsRemaining: 28 * 60,
      slaStatus: 'approaching_breach',
      created: iso(now - 92 * 60 * 1000),
      updated: iso(now - 14 * 60 * 1000),
      articles: [
        {
          articleId: 30001,
          from: 'Redfish Telemetry Collector <noc-alerts@atlancis.com>',
          subject: 'SMART Failure Predicted on Disk.Bay.4 (S64GNX0T409912)',
          body: 'Automated Redfish collector detected FailurePredicted=true and Health=Critical on Samsung PM9A3 3.84TB NVMe drive in ATHI-OCP-SRV-NODE02 (BMC 10.10.131.22). Immediate hot-swap dispatch requested.',
          senderType: 'system',
          isVisibleForCustomer: 0,
          created: iso(now - 92 * 60 * 1000),
          attachments: [
            {
              attachmentId: 1,
              filename: 'smart-nvme-bay04-telemetry.json',
              contentType: 'application/json',
              filesize: '2.1 KB',
              contentBase64: Buffer.from(JSON.stringify({ host: 'athi-ocp-srv02', drive: 'Disk.Bay.4', mediaWearout: 99, failurePredicted: true }, null, 2)).toString('base64'),
            },
          ],
        },
        {
          articleId: 30002,
          from: 'David Kiplagat <david@atlancis.com>',
          subject: 'Internal Triage Note',
          body: 'Draining Ceph OSD.14 weight to 0.0 before scheduling physical bay replacement in Athi River DC1 Rack 01.',
          senderType: 'agent',
          isVisibleForCustomer: 0,
          created: iso(now - 14 * 60 * 1000),
          attachments: [],
        },
      ],
      history: [
        { timestamp: iso(now - 92 * 60 * 1000), action: 'NewTicket', actor: 'noc-alerts@atlancis.com', detail: 'Ticket created in Storage queue (4 Critical)' },
        { timestamp: iso(now - 75 * 60 * 1000), action: 'OwnerUpdate', actor: 'David', detail: 'Owner assigned to David; Responsible set to Julius.Mutai' },
        { timestamp: iso(now - 14 * 60 * 1000), action: 'AddNote', actor: 'David', detail: 'Added internal technical note' },
      ],
    },
    {
      id: 2002,
      ticketNumber: '202611131000442',
      title: 'Elevated I/O wait on CBA Payments Gateway VM (VM-CBA-PAYMENTS-GW01)',
      queue: 'Cloud Platform',
      queueId: 66,
      state: 'new',
      stateType: 'new',
      priority: '4 Critical',
      priorityId: 4,
      customer: 'Commercial bank of Africa (CBA) Kenya',
      customerUser: 'ops@cba.co.ke',
      owner: 'Njuguna',
      responsible: 'Peter.Kamundia',
      service: 'Commercial bank of Africa (CBA) Kenya',
      sla: 'Enterprise Gold SLA',
      slaSolutionMinutes: 240,
      escalationDestinationDate: iso(now + 42 * 60 * 1000),
      escalationSecondsRemaining: 42 * 60,
      slaStatus: 'approaching_breach',
      created: iso(now - 198 * 60 * 1000),
      updated: iso(now - 45 * 60 * 1000),
      articles: [
        {
          articleId: 30003,
          from: 'CBA Infrastructure Ops <ops@cba.co.ke>',
          subject: 'Elevated disk latency on payments-gw01.cba.atlancis.cloud',
          body: 'We are seeing p99 disk commit latency spike above 85ms since 07:05 EAT on VM-CBA-PAYMENTS-GW01. Please verify underlying hypervisor storage health.',
          senderType: 'customer',
          isVisibleForCustomer: 1,
          created: iso(now - 198 * 60 * 1000),
          attachments: [],
        },
      ],
      history: [
        { timestamp: iso(now - 198 * 60 * 1000), action: 'NewTicket', actor: 'ops@cba.co.ke', detail: 'Created via portal_with_catalogue' },
      ],
    },
    {
      id: 2003,
      ticketNumber: '202611121000438',
      title: 'Intermittent FCS/CRC Optical Errors on Top Plaza Distribution Uplink Et49/1',
      queue: 'Network',
      queueId: 36,
      state: 'open',
      stateType: 'open',
      priority: '3 Major',
      priorityId: 3,
      customer: 'Atlancis Internal',
      customerUser: 'netmon@atlancis.com',
      owner: 'Elias',
      responsible: 'francis.makumi',
      service: 'Enterprise MPLS & Connectivity',
      sla: 'Standard Operations SLA',
      slaSolutionMinutes: 480,
      escalationDestinationDate: iso(now + 5 * hr),
      escalationSecondsRemaining: 5 * 3600,
      slaStatus: 'within_sla',
      created: iso(now - 18 * hr),
      updated: iso(now - 3 * hr),
      articles: [
        {
          articleId: 30004,
          from: 'SNMP Poller <netmon@atlancis.com>',
          subject: 'Input CRC errors incrementing on TOPPLAZA-DIST-SW01 Et49/1',
          body: 'Optical Rx power dropped to -14.8 dBm on dark-fiber trunk linking Top Plaza HQ to Athi River Core Spine.',
          senderType: 'system',
          isVisibleForCustomer: 0,
          created: iso(now - 18 * hr),
          attachments: [],
        },
      ],
      history: [
        { timestamp: iso(now - 18 * hr), action: 'NewTicket', actor: 'netmon@atlancis.com', detail: 'Ticket opened in Network queue' },
      ],
    },
    {
      id: 2004,
      ticketNumber: '202611111000429',
      title: 'Correctable ECC Memory Threshold Warning on NBO-DELL-R750-DB01 DIMM A4',
      queue: 'Server',
      queueId: 1,
      state: 'pending reminder',
      stateType: 'pending reminder',
      priority: '2 Minor',
      priorityId: 2,
      customer: 'KPLC Oracle M8',
      customerUser: 'dba@kplc.co.ke',
      owner: 'brian.koech',
      responsible: 'David',
      service: 'KPLC Oracle M8',
      sla: 'Enterprise Gold SLA',
      slaSolutionMinutes: 240,
      escalationDestinationDate: iso(now + 26 * hr),
      escalationSecondsRemaining: 26 * 3600,
      slaStatus: 'within_sla',
      created: iso(now - 2 * day),
      updated: iso(now - 12 * hr),
      articles: [
        {
          articleId: 30005,
          from: 'Brian Koech <brian.koech@atlancis.com>',
          subject: 'Maintenance window scheduled with DBA team',
          body: 'Customer approved Sunday 02:00 EAT maintenance window to swap DDR4 RDIMM in slot A4.',
          senderType: 'agent',
          isVisibleForCustomer: 1,
          created: iso(now - 12 * hr),
          attachments: [],
        },
      ],
      history: [
        { timestamp: iso(now - 2 * day), action: 'NewTicket', actor: 'dba@kplc.co.ke', detail: 'Created in Server queue' },
        { timestamp: iso(now - 12 * hr), action: 'StateUpdate', actor: 'brian.koech', detail: 'State changed from open to pending reminder' },
      ],
    },
    {
      id: 2005,
      ticketNumber: '202611101000415',
      title: 'Kubernetes Ingress TLS Certificate Renewal & WAF Policy Sync',
      queue: 'DevOps Department',
      queueId: 44,
      state: 'closed successful',
      stateType: 'closed',
      priority: '3 Major',
      priorityId: 3,
      customer: 'Servenah Cloud',
      customerUser: 'devops@atlancis.com',
      owner: 'nash.wanjii',
      responsible: 'Njuguna',
      service: 'Servenah Cloud Compute',
      sla: 'Standard Operations SLA',
      slaSolutionMinutes: 480,
      escalationDestinationDate: null,
      escalationSecondsRemaining: null,
      slaStatus: 'met',
      created: iso(now - 3 * day),
      updated: iso(now - 2 * day - 18 * hr),
      articles: [
        {
          articleId: 30006,
          from: 'Nash Wanjii <nash.wanjii@atlancis.com>',
          subject: 'Completed cert-manager rotation',
          body: 'Wildcard certificate renewed and synced across all Servenah ingress controllers. Verified TLS 1.3 handshake.',
          senderType: 'agent',
          isVisibleForCustomer: 1,
          created: iso(now - 2 * day - 18 * hr),
          attachments: [],
        },
      ],
      history: [
        { timestamp: iso(now - 3 * day), action: 'NewTicket', actor: 'devops@atlancis.com', detail: 'Ticket opened' },
        { timestamp: iso(now - 2 * day - 18 * hr), action: 'StateUpdate', actor: 'nash.wanjii', detail: 'State changed to closed successful' },
      ],
    },
    {
      id: 2006,
      ticketNumber: '202611081000398',
      title: 'VPN Tunnel Instability for Judicial Service Commission DR Site',
      queue: 'Cloud Platform::Internal Security Department',
      queueId: 55,
      state: 'open',
      stateType: 'open',
      priority: '3 Major',
      priorityId: 3,
      customer: 'Judicial Service Commission',
      customerUser: 'ict@jsc.go.ke',
      owner: 'Toney.Webala',
      responsible: 'hussein.kadweka',
      service: 'Judicial Service Commission',
      sla: 'Standard Operations SLA',
      slaSolutionMinutes: 480,
      escalationDestinationDate: iso(now - 35 * 60 * 1000), // Overdue!
      escalationSecondsRemaining: -35 * 60,
      slaStatus: 'breached',
      created: iso(now - 4 * day),
      updated: iso(now - 6 * hr),
      articles: [
        {
          articleId: 30007,
          from: 'JSC ICT Team <ict@jsc.go.ke>',
          subject: 'IPsec Phase 2 rekey drops every 4 hours',
          body: 'Observing DPD timeouts during IPsec SA rekeying between FortiGate 1800F and remote branch CPE.',
          senderType: 'customer',
          isVisibleForCustomer: 1,
          created: iso(now - 4 * day),
          attachments: [],
        },
      ],
      history: [
        { timestamp: iso(now - 4 * day), action: 'NewTicket', actor: 'ict@jsc.go.ke', detail: 'Created in Internal Security Department' },
      ],
    },
    {
      id: 2007,
      ticketNumber: '202610241000350',
      title: 'Provision 4x New Cambium Sector Access Points for Mawingu KU Expansion',
      queue: 'Network',
      queueId: 36,
      state: 'closed successful',
      stateType: 'closed',
      priority: '2 Minor',
      priorityId: 2,
      customer: 'KU/Mawingu',
      customerUser: 'noc@mawingu.co',
      owner: 'francis.makumi',
      responsible: 'Elias',
      service: 'Enterprise MPLS & Connectivity',
      sla: 'Standard Operations SLA',
      slaSolutionMinutes: 480,
      escalationDestinationDate: null,
      escalationSecondsRemaining: null,
      slaStatus: 'met',
      created: iso(now - 19 * day),
      updated: iso(now - 18 * day),
      articles: [],
      history: [],
    },
    {
      id: 2008,
      ticketNumber: '202609181000290',
      title: 'Quarterly Firmware Audit on Athi OCP BMC Managers',
      queue: 'Server',
      queueId: 1,
      state: 'closed successful',
      stateType: 'closed',
      priority: '1 Low',
      priorityId: 1,
      customer: 'Atlancis Internal',
      customerUser: 'ops@atlancis.com',
      owner: 'David',
      responsible: 'David',
      service: 'Athi OCP Colocation & Managed Infra',
      sla: 'Standard Operations SLA',
      slaSolutionMinutes: 480,
      escalationDestinationDate: null,
      escalationSecondsRemaining: null,
      slaStatus: 'met',
      created: iso(now - 52 * day),
      updated: iso(now - 50 * day),
      articles: [],
      history: [],
    },
  ];
}

const state = {
  cis: createInitialCIs(),
  relationships: createInitialRelationships(),
  tickets: createInitialTickets(),
};

function getDemoState() {
  return state;
}

function addDemoCI({ className, name, deplState = 'Production', inciState = 'Operational', attributes = {}, actor = 'demo.operator' }) {
  const id = ++nextCiId;
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ciXmlData = buildZnunyCIXMLData(className, attributes);
  const raw = {
    ConfigItemID: id,
    Number: `10999${String(id).padStart(6, '0')}`,
    Name: name,
    Class: className,
    VersionID: 1,
    CurDeplState: deplState,
    CurInciState: inciState,
    CreateTime: nowStr,
    ChangeTime: nowStr,
    CIXMLData: ciXmlData,
  };
  const normalized = {
    ...normalizeZnunyCI(raw),
    versionHistory: [
      {
        versionId: 1,
        deplState,
        inciState,
        changedAt: nowStr,
        changedBy: actor,
        note: 'Created via ITSM Center',
      },
    ],
  };
  state.cis.unshift(normalized);
  return normalized;
}

function updateDemoCI(id, { name, deplState, inciState, attributes, replaceExistingData = false, actor = 'demo.operator', note = 'Updated via ITSM Center' }) {
  const idx = state.cis.findIndex((c) => c.id === Number(id));
  if (idx === -1) return null;
  const current = state.cis[idx];
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const mergedAttrs = replaceExistingData ? { ...(attributes || {}) } : { ...current.attributes, ...(attributes || {}) };
  const ciXmlData = buildZnunyCIXMLData(current.className, mergedAttrs);
  const newVer = (current.versionId || 1) + 1;

  const updated = {
    ...normalizeZnunyCI({
      ConfigItemID: current.id,
      Number: current.ciNumber,
      Name: name || current.name,
      Class: current.className,
      VersionID: newVer,
      CurDeplState: deplState || current.deplState,
      CurInciState: inciState || current.inciState,
      CreateTime: current.createdTime,
      ChangeTime: nowStr,
      CIXMLData: ciXmlData,
    }),
    versionHistory: [
      {
        versionId: newVer,
        deplState: deplState || current.deplState,
        inciState: inciState || current.inciState,
        changedAt: nowStr,
        changedBy: actor,
        note,
      },
      ...(current.versionHistory || []),
    ],
  };
  state.cis[idx] = updated;
  return updated;
}

function deleteDemoCI(id) {
  const idx = state.cis.findIndex((c) => c.id === Number(id));
  if (idx === -1) return null;
  const [removed] = state.cis.splice(idx, 1);
  state.relationships = state.relationships.filter(
    (r) => !(r.sourceType === 'ITSMConfigItem' && r.sourceId === Number(id)) && !(r.targetType === 'ITSMConfigItem' && r.targetId === Number(id))
  );
  return removed;
}

function addDemoRelationship({ sourceType = 'ITSMConfigItem', sourceId, targetType = 'ITSMConfigItem', targetId, linkType = 'Includes', description = '' }) {
  const exists = state.relationships.find(
    (r) =>
      r.sourceType === sourceType &&
      Number(r.sourceId) === Number(sourceId) &&
      r.targetType === targetType &&
      Number(r.targetId) === Number(targetId) &&
      r.linkType === linkType
  );
  if (exists) return exists;
  const rel = {
    id: `rel-${++nextRelId}`,
    sourceType,
    sourceId: Number(sourceId),
    targetType,
    targetId: Number(targetId),
    linkType,
    description,
  };
  state.relationships.push(rel);
  return rel;
}

function removeDemoRelationship(relId) {
  const idx = state.relationships.findIndex((r) => String(r.id) === String(relId));
  if (idx === -1) return null;
  const [removed] = state.relationships.splice(idx, 1);
  return removed;
}

function addDemoTicket({ title, queue, priority, state: ticketState = 'new', customer, customerUser, owner, responsible, service, sla, article, linkedCiIds = [], actor = 'demo.operator' }) {
  const id = ++nextTicketId;
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ticketNumber = `2026111310${String(id).padStart(5, '0')}`;
  const articles = [];
  if (article && article.body) {
    articles.push({
      articleId: ++nextArticleId,
      from: `${actor}@atlancis.com`,
      subject: article.subject || title,
      body: article.body,
      senderType: 'agent',
      isVisibleForCustomer: article.isVisibleForCustomer ? 1 : 0,
      created: nowStr,
      attachments: [],
    });
  }

  const slaObj = DEMO_SLAS.find((s) => s.Name === sla);
  const solMins = slaObj ? slaObj.SolutionTime : 240;
  const destDate = new Date(Date.now() + solMins * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  const created = {
    id,
    ticketNumber,
    title,
    queue: queue || 'Server',
    queueId: 1,
    state: ticketState,
    stateType: ticketState.includes('closed') ? 'closed' : ticketState.includes('pending') ? 'pending reminder' : ticketState,
    priority: priority || '3 Major',
    priorityId: 3,
    customer: customer || 'Atlancis Internal',
    customerUser: customerUser || 'ops@atlancis.com',
    owner: owner || actor,
    responsible: responsible || actor,
    service: service || '',
    sla: sla || '',
    slaSolutionMinutes: solMins,
    escalationDestinationDate: ticketState.includes('closed') ? null : destDate,
    escalationSecondsRemaining: ticketState.includes('closed') ? null : solMins * 60,
    slaStatus: ticketState.includes('closed') ? 'met' : 'within_sla',
    created: nowStr,
    updated: nowStr,
    articles,
    history: [{ timestamp: nowStr, action: 'NewTicket', actor, detail: `Ticket created in ${queue || 'Server'} (${priority || '3 Major'})` }],
  };

  state.tickets.unshift(created);

  for (const ciId of linkedCiIds) {
    addDemoRelationship({
      sourceType: 'Ticket',
      sourceId: id,
      targetType: 'ITSMConfigItem',
      targetId: Number(ciId),
      linkType: 'DependsOn',
      description: 'Linked during ticket creation',
    });
  }

  return created;
}

function updateDemoTicket(id, { title, queue, state: nextState, priority, owner, responsible, service, sla, article, linkedCiIds, actor = 'demo.operator' }) {
  const idx = state.tickets.findIndex((t) => t.id === Number(id));
  if (idx === -1) return null;
  const current = state.tickets[idx];
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const changes = [];

  if (nextState && nextState !== current.state) changes.push(`State: ${current.state} -> ${nextState}`);
  if (priority && priority !== current.priority) changes.push(`Priority: ${current.priority} -> ${priority}`);
  if (queue && queue !== current.queue) changes.push(`Queue: ${current.queue} -> ${queue}`);
  if (owner && owner !== current.owner) changes.push(`Owner: ${current.owner} -> ${owner}`);
  if (responsible && responsible !== current.responsible) changes.push(`Responsible: ${current.responsible} -> ${responsible}`);

  const nextArticles = [...(current.articles || [])];
  if (article && article.body) {
    nextArticles.push({
      articleId: ++nextArticleId,
      from: `${actor}@atlancis.com`,
      subject: article.subject || (article.isVisibleForCustomer ? `Update: ${current.title}` : 'Internal Operations Note'),
      body: article.body,
      senderType: 'agent',
      isVisibleForCustomer: article.isVisibleForCustomer ? 1 : 0,
      created: nowStr,
      attachments: Array.isArray(article.attachments) ? article.attachments : [],
    });
    changes.push(article.isVisibleForCustomer ? 'Added customer-visible reply' : 'Added internal technical note');
  }

  const finalState = nextState || current.state;
  const isClosed = finalState.toLowerCase().includes('closed');

  const updated = {
    ...current,
    title: title || current.title,
    queue: queue || current.queue,
    state: finalState,
    stateType: isClosed ? 'closed' : finalState.includes('pending') ? 'pending reminder' : finalState,
    priority: priority || current.priority,
    owner: owner || current.owner,
    responsible: responsible || current.responsible,
    service: service !== undefined ? service : current.service,
    sla: sla !== undefined ? sla : current.sla,
    slaStatus: isClosed ? 'met' : current.slaStatus,
    escalationDestinationDate: isClosed ? null : current.escalationDestinationDate,
    escalationSecondsRemaining: isClosed ? null : current.escalationSecondsRemaining,
    updated: nowStr,
    articles: nextArticles,
    history: [
      ...(changes.length > 0 ? [{ timestamp: nowStr, action: 'TicketUpdate', actor, detail: changes.join('; ') }] : []),
      ...(current.history || []),
    ],
  };

  state.tickets[idx] = updated;

  if (Array.isArray(linkedCiIds)) {
    state.relationships = state.relationships.filter((r) => !(r.sourceType === 'Ticket' && r.sourceId === Number(id)));
    for (const ciId of linkedCiIds) {
      addDemoRelationship({
        sourceType: 'Ticket',
        sourceId: Number(id),
        targetType: 'ITSMConfigItem',
        targetId: Number(ciId),
        linkType: 'DependsOn',
        description: 'Associated infrastructure CI',
      });
    }
  }

  return updated;
}

module.exports = {
  DEMO_QUEUES,
  DEMO_PRIORITIES,
  DEMO_SERVICES,
  DEMO_SLAS,
  DEMO_AGENTS,
  getDemoState,
  addDemoCI,
  updateDemoCI,
  deleteDemoCI,
  addDemoRelationship,
  removeDemoRelationship,
  addDemoTicket,
  updateDemoTicket,
};
