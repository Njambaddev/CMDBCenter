# ITSM Center

> Atlancis ITSM Center — CMDB, asset & service operations management on top of Znuny.

Modern, enterprise-grade IT Operations & Configuration Management Database (CMDB) Dashboard built on **React 18, Vite 5, Ant Design 5, Recharts, Node.js, and Express**, powered by the **Znuny 6.5.1 GenericInterface REST API**.

---

## Architecture Overview

```text
[ Browser: React + Vite + AntD 5 + Recharts ]
              |
              |  Opaque Token (x-dashboard-token / HttpOnly Cookie)
              v
[ Node.js + Express API Gateway (:4000) ]
  - Server-side Session Vault (Znuny SessionID never leaves backend)
  - Class-Specific CIXMLData Bidirectional Transformer (23 Znuny Classes)
  - Live-Write Safety Gate (ALLOW_LIVE_WRITES=false by default)
  - RBAC Enforcement (admin / operator / viewer)
  - Persistent Confirmed Audit Trail (backend/data/audit-logs.json)
              |
              |  HTTPS REST (Host: mysupportstaging.atlancis.com)
              v
[ Znuny 6.5.1 GenericInterface (Mysupport-Prod-App) ]
  - ID 4: portal_with_catalogue  (Sessions, Tickets, Articles, Attachments, Catalogs)
  - ID 7: PDU_CircuitsOutlets_API (80 CMDB REST routes across 23 classes + Links)
  - ID 9: SLA Api                (ITSM Services & SLA Escalation Targets)
```

---

## Key Capabilities

1. **Executive Overview Dashboard (`/`)**
   - Real-time CMDB KPIs (Total, Operational, Warning, Incident, Retired, by Class, by Location) & Ticket KPIs (Total, Open, New, Pending, Closed, Approaching SLA Breach).
   - 5 Recharts visualizations (Daily Ticket Trends, Ticket State Donut, CMDB Class Bar Chart, Stacked Infrastructure Health by Class, Monthly Resolution Trends).
2. **CMDB Inventory Management (`/cmdb`)**
   - Full 11-column enterprise table with multi-field search, 5 facet filters, sorting, pagination, column visibility controls, and CSV / `.xlsx` exports.
   - **Dynamic Class-Specific CI Form**: Supports Computer, Server, Virtual Machine, Network Device, Switch, Firewall, Access Point, Chassis, Circuit, PDU, Storage Device, Software, Licence, and all 23 live Znuny CMDB classes — transforming fields into exact Znuny `CIXMLData` structures.
   - **CI Detail Drawer**: General, Hardware, Network, Ownership, Location, Associated Tickets, Related CIs, and Version History, plus Retire CI workflow.
   - **Bulk CMDB Wizard**: CSV/Excel template generator, file upload, required-field & duplicate Serial/CI check, non-destructive duplicate handling (`Skip` vs `Confirmed Update`), explicit confirmation gate, and exportable import report.
3. **CI Relationships & Dependency Topology (`/relationships`)**
   - Interactive hierarchical topology diagram (e.g., Athi OCP Chassis -> Servers -> VMs -> Apps; Core Switch -> Firewall/Distribution/APs; PDU -> Circuits -> Chassis).
   - Graceful fallback to telemetry/attribute correlation when live Znuny `Link::*` Perl modules are absent on staging, plus full interactive Link CRUD in Demo Mode (or when `Link::*` is present).
4. **Ticket Management & CMDB Integration (`/tickets`)**
   - Full queue/state/priority/customer/owner/SLA filtering, Ticket creation, inline triage & agent assignment, Internal Notes (`IsVisibleForCustomer: 0`) vs Customer Replies (`IsVisibleForCustomer: 1`), binary attachment downloads, and bidirectional CI linking.
5. **Reports & Analytics (`/reports`)**
   - 7 CMDB reports (including Missing Asset Metadata & Retired Assets) and 7 Ticket/SLA reports with CSV & Excel exports.
6. **Audit Logs (`/audit-logs`)**
   - Immutable backend audit log recording confirmed operations with full before/after JSON diff inspection.
7. **Settings & Live Diagnostics (`/settings`)**
   - One-click **Verify Znuny API Connectivity** probe across all 3 webservices, Live/Demo switcher, and Admin **Live-Write Safety Gate**.

---

## Quick Start (Host Node.js 20+)

### 1. Configure Backend Environment
Review `backend/.env` (created from `.env.example`):

```ini
PORT=4000
DEFAULT_MODE=live
ALLOW_LIVE_WRITES=false
ZNUNY_BASE_URL=https://127.0.0.1/otrs/nph-genericinterface.pl
ZNUNY_HOST_HEADER=mysupportstaging.atlancis.com
ZNUNY_REJECT_UNAUTHORIZED=false
ZNUNY_WS_TICKET=portal_with_catalogue
ZNUNY_WS_CMDB=PDU_CircuitsOutlets_API
ZNUNY_WS_SLA=SLA Api
```

### 2. Install & Start Backend
```bash
cd /opt/atlancis-itsm-dashboard/backend
npm install
npm start
```

### 3. Install & Start Frontend
```bash
cd /opt/atlancis-itsm-dashboard/frontend
npm install
npm run dev
```
Open `http://<server-ip>:5173` in your browser. Sign in with your **Znuny Agent credentials** for Live API mode, or click **Interactive Demo Sandbox** to test all read/write workflows immediately.

---

## Docker Compose Deployment (Connected to `mysupport_prod_network`)

```bash
cd /opt/atlancis-itsm-dashboard
docker compose up -d --build
```
- **ITSM Center (UI)**: `http://<server-ip>:8090`
- **Backend Gateway**: `http://<server-ip>:4000/api/health`
