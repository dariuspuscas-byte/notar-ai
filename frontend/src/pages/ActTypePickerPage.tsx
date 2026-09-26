import { useNavigate } from 'react-router-dom'
import { useActTypes } from '../api/actTypes'
import { useCreateCase } from '../api/cases'
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

// NOTE: GET /act-types (ARCHITECTURE.md §3.1) only returns id/code/name_ro/
// status — no one-line descriptor field, even though `act_types.description`
// exists in the §2.1 schema and the UX mockup shows one per card. Rather than
// assume the API will add it, this is a small presentational-only lookup by
// `code`, with a generic fallback for any act type not in this list. Flagged
// in the final report — ideally the backend adds `description` to this
// endpoint's response and this map goes away.
const DESCRIPTOR_BY_CODE: Record<string, string> = {
  sale_purchase: 'Real estate property transfer',
  succession: 'Succession proceedings',
  donation: 'Transfer free of charge',
  mortgage: 'Real estate collateral',
  power_of_attorney: 'Notarial power of attorney',
  other: 'Custom document list',
}

export default function ActTypePickerPage() {
  const navigate = useNavigate()
  const { data: actTypes, isLoading, isError } = useActTypes()
  const createCase = useCreateCase()

  const handlePick = (actTypeId: string) => {
    createCase.mutate(
      { act_type_id: actTypeId, client_name: 'New client' },
      {
        onSuccess: (created) => navigate(`/cases/${created.id}`),
      },
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="flex h-[60px] items-center justify-between border-b border-gray-200 bg-white px-6 sm:px-12">
        <span className="text-[15px] font-bold text-gray-900">Case Register</span>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          All cases
        </button>
      </div>

      <div className="flex flex-col items-center px-6 py-12 sm:px-12 sm:py-16">
        <div className="mb-10 flex w-full max-w-3xl flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-[26px]">
            New case — choose the act type
          </h1>
          <p className="text-sm text-gray-500">
            The list of required documents is generated automatically based on the act type.
          </p>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Loading act types...</p>}
        {isError && (
          <p className="text-sm text-red-600">
            Could not load act types. Check your connection and try again.
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
                    nameRo={at.name_ro}
                    descriptor={DESCRIPTOR_BY_CODE[at.code] ?? 'Specific document list'}
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
            Could not create the case. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
