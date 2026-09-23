import type { AddDisposalRequest } from "@moj-bichard7/core/types/leds/AddDisposalRequest"
import type { AsnQueryResponse } from "@moj-bichard7/core/types/leds/AsnQueryResponse"
import type { ErrorResponse } from "@moj-bichard7/core/types/leds/ErrorResponse"
import type { RemandRequest } from "@moj-bichard7/core/types/leds/RemandRequest"
import type { SubsequentDisposalResultsRequest } from "@moj-bichard7/core/types/leds/SubsequentDisposalResultsRequest"

type EventDetails = {
  queryResponse?: { response: AsnQueryResponse | ErrorResponse; timestamp: string }
  addDisposal?: { request: AddDisposalRequest; timestamp: string }
  remand?: { request: RemandRequest; timestamp: string }
  subsequentlyVaried?: { request: SubsequentDisposalResultsRequest; timestamp: string }
  sentenceDeferred?: { request: SubsequentDisposalResultsRequest; timestamp: string }
  penaltyHearing?: { request: string; timestamp: string }
}

export default EventDetails
