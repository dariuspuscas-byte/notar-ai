import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { useActTypes } from '../api/actTypes'
import { DEFAULT_CLIENT_NAME, useCreateCase } from '../api/cases'
import { ActTypeCard } from '../components/ActTypeCard'
import {
  BankIcon,
  FamilyIcon,
  HeartIcon,
  InfoCircleIcon,
  PropertyDocIcon,
  SingleUserIcon,
} from '../components/icons'
import type { ComponentType, SVGProps } from 'react'

const ICONS_BY_CODE: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  sale_purchase: PropertyDocIcon,
  succession: FamilyIcon,
  donation: HeartIcon,
  mortgage: BankIcon,
  power_of_attorney: SingleUserIcon,
  other: InfoCircleIcon,
}

// NOTE: GET /act-types (ARCHITECTURE.md §3.1) only returns id/code/name/
// status — no one-line descriptor field, even though `act_types.description`
// exists in the §2.1 schema and the UX mockup shows one per card. Rather than
// assume the API will add it, this is a small presentational-only lookup by
// `code`, with a generic fallback for any act type not in this list. Flagged
// in the final report — ideally the backend adds `description` to this
// endpoint's response and this map goes away.
const DESCRIPTOR_KEY_BY_CODE: Record<string, ParseKeys> = {
  sale_purchase: 'actTypePicker.descriptors.sale_purchase',
  succession: 'actTypePicker.descriptors.succession',
  donation: 'actTypePicker.descriptors.donation',
  mortgage: 'actTypePicker.descriptors.mortgage',
  power_of_attorney: 'actTypePicker.descriptors.power_of_attorney',
  other: 'actTypePicker.descriptors.other',
}

export default function ActTypePickerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: actTypes, isLoading, isError } = useActTypes()
  const createCase = useCreateCase()

  const handlePick = (actTypeId: string) => {
    createCase.mutate(
      { act_type_id: actTypeId, client_name: DEFAULT_CLIENT_NAME },
      {
        onSuccess: (created) => navigate(`/cases/${created.id}`),
      },
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="flex h-[60px] items-center justify-between border-b border-gray-200 bg-white px-6 sm:px-12">
        <span className="text-[15px] font-bold text-gray-900">{t('common.appTitle')}</span>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          {t('common.allCases')}
        </button>
      </div>

      <div className="flex flex-col items-center px-6 py-12 sm:px-12 sm:py-16">
        <div className="mb-10 flex w-full max-w-3xl flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-[26px]">
            {t('actTypePicker.title')}
          </h1>
          <p className="text-sm text-gray-500">
            {t('actTypePicker.subtitle')}
          </p>
        </div>

        {isLoading && <p className="text-sm text-gray-500">{t('actTypePicker.loading')}</p>}
        {isError && (
          <p className="text-sm text-red-600">
            {t('actTypePicker.loadError')}
          </p>
        )}

        {actTypes && (
          <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {actTypes
              .map((at) => {
                const Icon = ICONS_BY_CODE[at.code] ?? InfoCircleIcon
                return (
                  <ActTypeCard
                    key={at.id}
                    name={at.name}
                    descriptor={t(DESCRIPTOR_KEY_BY_CODE[at.code] ?? 'actTypePicker.descriptorFallback')}
                    icon={<Icon className="h-6 w-6" />}
                    onClick={() => handlePick(at.id)}
                    disabled={createCase.isPending}
                  />
                )
              })}
          </div>
        )}
        {createCase.isError && (
          <p className="mt-4 text-sm text-red-600">
            {t('actTypePicker.createError')}
          </p>
        )}
      </div>
    </div>
  )
}
