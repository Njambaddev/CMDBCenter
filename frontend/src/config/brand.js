// Single source of truth for product naming / branding.
export const BRAND = {
  name: 'CMDB Center',
  shortName: 'CMDB Center',
  organisation: 'Atlancis',
  tagline: 'Infrastructure Assets & Configuration Management',
  logoLetter: 'AC',
};

export const pageTitle = (section) => (section ? `${section} · ${BRAND.name}` : `${BRAND.name} · ${BRAND.organisation}`);
