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
  name_ro: string
  description: string | null
  is_mandatory: boolean
  allow_multiple: boolean
  sort_order: number
  /** Keywords used only by the mock classifier to "read" an uploaded filename. */
  hints: string[]
}

export interface SeedActType {
  code: string
  name_ro: string
  name_en: string
  description: string
  requiredDocumentTypes: SeedRequiredDocType[]
}

export const SEED_ACT_TYPES: SeedActType[] = [
  {
    code: 'sale_purchase',
    name_ro: 'Sale-purchase',
    name_en: 'Sale-purchase',
    description: 'Real estate property transfer',
    requiredDocumentTypes: [
      {
        code: 'extras_cf',
        name_ro: 'Up-to-date land registry extract',
        description: 'Issued no more than 30 days before signing.',
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['extras cf', 'carte funciara', 'cf', 'extras de carte funciara'],
      },
      {
        code: 'act_proprietate',
        name_ro: 'Seller\'s title deed',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 2,
        hints: ['act proprietate', 'titlu proprietate', 'contract vanzare anterior'],
      },
      {
        code: 'certificat_fiscal',
        name_ro: 'Tax certificate — City Hall',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 3,
        hints: ['certificat fiscal', 'impozite', 'primarie'],
      },
      {
        code: 'cert_energetic',
        name_ro: 'Energy performance certificate',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 4,
        hints: ['certificat energetic', 'performanta energetica', 'cpe'],
      },
      {
        code: 'id_card_vanzator',
        name_ro: 'Seller ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 5,
        hints: ['ci vanzator', 'buletin vanzator', 'identitate vanzator'],
      },
      {
        code: 'id_card_cumparator',
        name_ro: 'Buyer ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 6,
        hints: ['ci cumparator', 'buletin cumparator', 'identitate cumparator'],
      },
      {
        code: 'cert_casatorie',
        name_ro: 'Marriage certificate',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 7,
        hints: ['certificat casatorie', 'casatorie'],
      },
      {
        code: 'adeverinta_asociatie',
        name_ro: 'Homeowners\' association certificate',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 8,
        hints: ['adeverinta asociatie', 'asociatia de proprietari', 'intretinere'],
      },
    ],
  },
  {
    code: 'succession',
    name_ro: 'Succession',
    name_en: 'Succession',
    description: 'Succession proceedings',
    requiredDocumentTypes: [
      {
        code: 'certificat_deces',
        name_ro: 'Death certificate',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['certificat deces', 'deces'],
      },
      {
        code: 'acte_stare_civila',
        name_ro: 'Heirs\' birth/marriage certificates',
        description: 'Prove kinship with the deceased.',
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 2,
        hints: ['certificat nastere', 'certificat casatorie', 'stare civila'],
      },
      {
        code: 'id_card_mostenitori',
        name_ro: 'Heirs\' ID cards',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 3,
        hints: ['ci mostenitor', 'buletin mostenitor', 'identitate mostenitor'],
      },
      {
        code: 'testament',
        name_ro: 'Will',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 4,
        hints: ['testament'],
      },
      {
        code: 'extras_cf_defunct',
        name_ro: 'Land registry extract for estate properties',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 5,
        hints: ['extras cf', 'carte funciara defunct'],
      },
      {
        code: 'act_proprietate_defunct',
        name_ro: 'Deceased\'s title deeds',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 6,
        hints: ['act proprietate defunct', 'titlu proprietate defunct'],
      },
      {
        code: 'certificat_fiscal',
        name_ro: 'Tax certificate',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 7,
        hints: ['certificat fiscal', 'impozite'],
      },
    ],
  },
  {
    code: 'donation',
    name_ro: 'Donation',
    name_en: 'Donation',
    description: 'Transfer free of charge',
    requiredDocumentTypes: [
      {
        code: 'act_proprietate',
        name_ro: 'Donor\'s title deed',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['act proprietate'],
      },
      {
        code: 'extras_cf',
        name_ro: 'Up-to-date land registry extract',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 2,
        hints: ['extras cf', 'carte funciara'],
      },
      {
        code: 'id_card_donator',
        name_ro: 'Donor ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 3,
        hints: ['ci donator', 'buletin donator'],
      },
      {
        code: 'id_card_donatar',
        name_ro: 'Donee ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 4,
        hints: ['ci donatar', 'buletin donatar'],
      },
    ],
  },
  {
    code: 'mortgage',
    name_ro: 'Mortgage / Loan',
    name_en: 'Mortgage / Credit',
    description: 'Real estate collateral',
    requiredDocumentTypes: [
      {
        code: 'contract_credit',
        name_ro: 'Loan agreement',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['contract credit'],
      },
      {
        code: 'extras_cf',
        name_ro: 'Up-to-date land registry extract',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 2,
        hints: ['extras cf', 'carte funciara'],
      },
      {
        code: 'id_card_imprumutat',
        name_ro: 'Borrower ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 3,
        hints: ['ci imprumutat', 'buletin'],
      },
    ],
  },
  {
    code: 'power_of_attorney',
    name_ro: 'Power of attorney',
    name_en: 'Power of attorney',
    description: 'Notarial power of attorney',
    requiredDocumentTypes: [
      {
        code: 'id_card_mandant',
        name_ro: 'Principal ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: false,
        sort_order: 1,
        hints: ['ci mandant', 'buletin'],
      },
      {
        code: 'id_card_mandatar',
        name_ro: 'Agent ID card',
        description: null,
        is_mandatory: false,
        allow_multiple: false,
        sort_order: 2,
        hints: ['ci mandatar'],
      },
    ],
  },
  {
    code: 'other',
    name_ro: 'Other act type',
    name_en: 'Other',
    description: 'Custom document list',
    requiredDocumentTypes: [
      {
        code: 'id_card',
        name_ro: 'ID card',
        description: null,
        is_mandatory: true,
        allow_multiple: true,
        sort_order: 1,
        hints: ['ci', 'buletin', 'identitate'],
      },
    ],
  },
]

export const MOCK_CONFIDENCE_THRESHOLD = 0.8
