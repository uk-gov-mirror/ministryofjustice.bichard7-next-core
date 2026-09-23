import errorResponseSchema from "@moj-bichard7/core/schemas/leds/errorResponseSchema"
import type { AsnQueryResponse } from "@moj-bichard7/core/types/leds/AsnQueryResponse"
import type AddLine from "../types/AddLine"
import type EventDetails from "../types/EventDetails"
import getOffenceCodeDetails from "../utils/getOffenceCodeDetails"
import getResultCodeDetails from "../utils/getResultCodeDetails"

const generateLinesForQuery = async (event: EventDetails, addLine: AddLine): Promise<void> => {
  addLine("==================================================================")
  addLine(`Bichard Query: Existing PNC offences and results\t${event.queryResponse!.timestamp}`)
  addLine("==================================================================")
  const errorQueryResponse = errorResponseSchema.safeParse(event.queryResponse?.response)
  if (errorQueryResponse.success) {
    addLine("")
    addLine(errorQueryResponse.data.leds.errors.map((error) => error.message).join("\n"))
    return
  }

  const queryResponse = event.queryResponse!.response as AsnQueryResponse
  addLine("\n--- Offences ---\n", (queryResponse.disposals[0].offences ?? []).length > 0)
  let offenceIndex = 1
  for (const offence of queryResponse.disposals[0].offences) {
    addLine("----------------------", offenceIndex > 1)
    addLine(`Offence #${offenceIndex++}`)
    addLine(`\tCourt offence sequence number: ${offence.courtOffenceSequenceNumber}`)
    addLine(`\tCode: ${await getOffenceCodeDetails(offence.cjsOffenceCode)}`)
    addLine(`Description: ${offence.offenceDescription}`, !!offence.offenceDescription, true)
    addLine(`\tNumber of offences taken into consideration (TIC): ${offence.offenceTic}`, !!offence.offenceTic)

    const offenceStartTime = offence.offenceStartTime ? ` ${offence.offenceStartTime}` : ""
    addLine(`\tStart date and time: ${offence.offenceStartDate}${offenceStartTime}`)
    if (offence.offenceEndDate) {
      const offenceEndTime = offence.offenceEndTime ? ` ${offence.offenceEndTime}` : ""
      addLine(`\tEnd date and time: ${offence.offenceEndDate}${offenceEndTime}`)
    }

    addLine(`\tRole qualifiers: ${offence.roleQualifiers}`, offence.roleQualifiers && offence.roleQualifiers.length > 0)
    addLine(`\tPlea: ${offence.plea}`, !!offence.plea)

    const adjudication = offence.adjudications?.sort((a, b) => (a.appearanceNumber < b.appearanceNumber ? 1 : -1))[0]
    addLine(`\tAdjudication: ${adjudication?.adjudication} (${adjudication?.disposalDate})`, !!adjudication)

    addLine("\n\t--- Disposal results ---\n", offence.disposalResults && offence.disposalResults.length > 0)

    let disposalIndex = 1
    for (const disposalResult of offence.disposalResults ?? []) {
      addLine(`\tDisposal Result #${disposalIndex++}`)
      addLine(`\t\t\tDisposal code: ${await getResultCodeDetails(disposalResult.disposalCode)}`)
      addLine("\t\t\tDisposal text:", !!disposalResult.disposalText, true)
      addLine(
        `\t\t\t\t${disposalResult.disposalText?.replace("\n", "\n\t\t\t\t")}`,
        !!disposalResult.disposalText,
        true
      )
      addLine(`\t\t\tEffective date: ${disposalResult.disposalEffectiveDate}`, !!disposalResult.disposalEffectiveDate)
      addLine(
        `\t\t\tFine: ${disposalResult.disposalFine?.amount} ${disposalResult.disposalFine?.units}`,
        !!disposalResult.disposalFine
      )
      addLine(
        `\t\t\tDuration: ${disposalResult.disposalDuration?.count} ${disposalResult.disposalDuration?.units}`,
        !!disposalResult.disposalDuration
      )
      addLine(`\t\t\tQualifiers: ${disposalResult.disposalQualifiers?.join(", ")}`, !!disposalResult.disposalQualifiers)
      addLine(
        `\t\t\tQualifier duration: ${disposalResult.disposalQualifierDuration?.count} ${disposalResult.disposalQualifierDuration?.units}`,
        !!disposalResult.disposalQualifierDuration
      )
    }
  }
}

export default generateLinesForQuery
