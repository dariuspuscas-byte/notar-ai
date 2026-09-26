/**
 * Seed data for the mock server — mirrors the "draft seed data" in
 * /specs/ARCHITECTURE.md §8 (Phase 0) for `sale_purchase` and `succession`.
 *
 * The other four act types shown in the UX mockups (donatie, ipoteca_credit,
 * procura, alt_tip_act) are NOT specced with a required-document list yet —
 * §8 only drafts sale_purchase and succession. They're included here with a
 * small placeholder checklist so the Act Type Picker matches the design
 * mockup, clearly marked as mock-only placeholders (see final report).
 */

export interface SeedRequiredDocType {
  code: string
  name: string
  description: string | null
  is_mandatory: boolean
  allow_multiple: boolean
  sort_order: number
  /** Keywords used only by the mock classifier to "read" an uploaded filename. */
  hints: string[]
}

export interface SeedActType {
  code: string
  name: string
  description: string
  requiredDocumentTypes: SeedRequiredDocType[]
}

export const SEED_ACT_TYPES: SeedActType[] = [
  {
    code: 'sale_purchase',
    name: 'Sale-purchase',
    description: 'Real estate property transfer',
    requiredDocumentTypes: [
      {
        code: 'land_registry_extract',
        name: 'Up-to-date land registry extract',
        description: 'Issued no more than 30 days before signing.',
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['land registry extract', 'land book extract', 'cadastral number'],
      },
      {
        code: 'title_deed',
        name: 'Seller\'s title deed',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 2,
        hints: ['title deed', 'property deed', 'sale contract'],
      },
      {
        code: 'tax_certificate',
        name: 'Tax certificate — City Hall',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 3,
        hints: ['tax certificate', 'city hall', 'local taxes'],
      },
      {
        code: 'energy_certificate',
        name: 'Energy performance certificate',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 4,
        hints: ['energy performance certificate', 'energy label'],
      },
      {
        code: 'seller_id_card',
        name: 'Seller ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 5,
        hints: ['identity card', 'ID card', 'national ID'],
      },
      {
        code: 'buyer_id_card',
        name: 'Buyer ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 6,
        hints: ['identity card', 'ID card', 'national ID'],
      },
      {
        code: 'marriage_certificate',
        name: 'Marriage certificate',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 7,
        hints: ['marriage certificate'],
      },
      {
        code: 'homeowners_association_certificate',
        name: 'Homeowners\' association certificate',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 8,
        hints: ['homeowners association', 'maintenance fees certificate'],
      },
    ],
  },
  {
    code: 'succession',
    name: 'Succession',
    description: 'Succession proceedings',
    requiredDocumentTypes: [
      {
        code: 'death_certificate',
        name: 'Death certificate',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['death certificate'],
      },
      {
        code: 'civil_status_certificates',
        name: 'Heirs\' birth/marriage certificates',
        description: 'Prove kinship with the deceased.',
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 2,
        hints: ['birth certificate', 'marriage certificate', 'civil status'],
      },
      {
        code: 'heirs_id_cards',
        name: 'Heirs\' ID cards',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 3,
        hints: ['identity card', 'ID card', 'national ID'],
      },
      {
        code: 'will',
        name: 'Will',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 4,
        hints: ['will', 'testament'],
      },
      {
        code: 'estate_land_registry_extract',
        name: 'Land registry extract for estate properties',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 5,
        hints: ['land registry extract', 'land book extract', 'cadastral number'],
      },
      {
        code: 'deceased_title_deeds',
        name: 'Deceased\'s title deeds',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 6,
        hints: ['title deed', 'property deed'],
      },
      {
        code: 'tax_certificate',
        name: 'Tax certificate',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 7,
        hints: ['tax certificate', 'city hall', 'local taxes'],
      },
    ],
  },
  {
    code: 'donation',
    name: 'Donation',
    description: 'Transfer free of charge',
    requiredDocumentTypes: [
      {
        code: 'title_deed',
        name: 'Donor\'s title deed',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['title deed', 'property deed', 'sale contract'],
      },
      {
        code: 'land_registry_extract',
        name: 'Up-to-date land registry extract',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 2,
        hints: ['land registry extract', 'land book extract', 'cadastral number'],
      },
      {
        code: 'donor_id_card',
        name: 'Donor ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 3,
        hints: ['identity card', 'ID card', 'national ID'],
      },
      {
        code: 'donee_id_card',
        name: 'Donee ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 4,
        hints: ['identity card', 'ID card', 'national ID'],
      },
    ],
  },
  {
    code: 'mortgage',
    name: 'Mortgage / Loan',
    description: 'Real estate collateral',
    requiredDocumentTypes: [
      {
        code: 'loan_agreement',
        name: 'Loan agreement',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['loan agreement', 'credit agreement', 'bank'],
      },
      {
        code: 'land_registry_extract',
        name: 'Up-to-date land registry extract',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 2,
        hints: ['land registry extract', 'land book extract', 'cadastral number'],
      },
      {
        code: 'borrower_id_card',
        name: 'Borrower ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 3,
        hints: ['identity card', 'ID card', 'national ID'],
      },
    ],
  },
  {
    code: 'power_of_attorney',
    name: 'Power of attorney',
    description: 'Notarial power of attorney',
    requiredDocumentTypes: [
      {
        code: 'principal_id_card',
        name: 'Principal ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['identity card', 'ID card', 'national ID'],
      },
      {
        code: 'agent_id_card',
        name: 'Agent ID card',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 2,
        hints: ['identity card', 'ID card', 'national ID'],
      },
    ],
  },
  {
    code: 'other',
    name: 'Other act type',
    description: 'Custom document list',
    requiredDocumentTypes: [
      {
        code: 'id_card',
        name: 'ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 1,
        hints: ['identity card', 'ID card', 'national ID'],
      },
    ],
  },
]

export const MOCK_CONFIDENCE_THRESHOLD = 0.8
