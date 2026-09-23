import { S3Client } from "@aws-sdk/client-s3"
import AuditLogDynamoGateway from "@moj-bichard7/api/services/gateways/dynamo/AuditLogDynamoGateway/AuditLogDynamoGateway"
import EventCode from "@moj-bichard7/common/types/EventCode"
import { convertPncJsonToLedsAsnQueryResponse } from "@moj-bichard7/e2e-tests/utils/converters/convertPncJsonToLeds/convertPncJsonToLedsAsnQueryResponse"
import convertPncToLeds from "@moj-bichard7/e2e-tests/utils/converters/convertPncToLeds"
import type { PncAsnQueryJson } from "@moj-bichard7/e2e-tests/utils/converters/convertPncXmlToJson/convertPncXmlToJson"
import convertPncXmlToJson from "@moj-bichard7/e2e-tests/utils/converters/convertPncXmlToJson/convertPncXmlToJson"
import generateLinesForAddDisposal from "./textGenerators/generateLinesForAddDisposal"
import generateLinesForQuery from "./textGenerators/generateLinesForQuery"
import generateLinesForRemand from "./textGenerators/generateLinesForRemand"
import generateLinesForSpi from "./textGenerators/generateLinesForSpi"
import generateLinesForSubsequentDisposalResult from "./textGenerators/generateLinesForSubsequentDisposalResult"
import type EventDetails from "./types/EventDetails"
import addLineFn from "./utils/addLineFn"

type GenerateCaseSummaryResult = {
  hasExceptions: boolean
  hasPenaltyHearingUpdate: boolean
  operations: string[]
  asn: string
  summary: string
}

type GenerateCaseSummaryOptions = {
  s3Path?: string
  doNotPrintSummary?: boolean
  redactSensitiveData?: boolean
}

const dynamoGateway = new AuditLogDynamoGateway({
  auditLogTableName: "bichard-7-production-audit-log",
  eventsTableName: "bichard-7-production-audit-log-events"
})
const s3Client = new S3Client({ region: "eu-west-2" })

const generateCaseSummary = async (
  messageId: string,
  options?: GenerateCaseSummaryOptions
): Promise<GenerateCaseSummaryResult> => {
  const output: GenerateCaseSummaryResult = {
    hasExceptions: false,
    hasPenaltyHearingUpdate: false,
    operations: [],
    asn: "",
    summary: ""
  }
  const lines: string[] = []
  const addLine = addLineFn(lines, !!options?.redactSensitiveData)

  let s3Path = options?.s3Path
  if (!s3Path) {
    const auditLog = await dynamoGateway.fetchOne(messageId, { includeColumns: ["s3Path"] })
    if (auditLog instanceof Error) {
      throw auditLog
    }

    if (!auditLog) {
      throw Error(`Could not find audit log for message ID ${messageId}`)
    }

    s3Path = auditLog.s3Path
  }

  if (!s3Path) {
    throw Error("Could not fetch s3Path")
  }

  const events = await dynamoGateway.getEvents(messageId)
  if (events instanceof Error) {
    throw Error(`Failed to get events from Dynamodb for message ID ${messageId}. ${events.message}`)
  }

  if (events.find(({ eventCode }) => eventCode.includes("exception"))) {
    output.hasExceptions = true
  }

  await generateLinesForSpi(s3Client, s3Path, addLine)
  addLine("")

  const eventDetails: EventDetails[] = []
  events
    .filter((event) => event.eventCode === EventCode.PncResponseReceived)
    .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1))
    .forEach((event) => {
      const requestType = event.attributes?.["PNC Request Type"]
      if (requestType === "ENQASI") {
        output.asn =
          new RegExp(/<E07>(?<asn>.*)<\/E07>/)
            .exec(event.attributes?.["PNC Request Message"]?.toString() ?? "")
            ?.groups?.asn.replace(/\//g, "")
            .trim() ?? ""
        const pncJson = convertPncXmlToJson<PncAsnQueryJson>(String(event.attributes?.["PNC Response Message"]))
        const queryResponse = convertPncJsonToLedsAsnQueryResponse(pncJson, {
          asn: "DummyAsn",
          personId: "DummyPersonId",
          reportId: "DummyReportId",
          courtCaseId: "DummyCourtCaseId"
        })

        eventDetails.push({
          queryResponse: {
            response: queryResponse,
            timestamp: event.timestamp
          }
        })
      } else if (requestType === "DISARR") {
        eventDetails.push({
          addDisposal: {
            request: convertPncToLeds(String(event.attributes?.["PNC Request Message"]), "Add Disposal"),
            timestamp: event.timestamp
          }
        })
      } else if (requestType === "NEWREM") {
        eventDetails.push({
          remand: {
            request: convertPncToLeds(String(event.attributes?.["PNC Request Message"]), "Remand"),
            timestamp: event.timestamp
          }
        })
      } else if (requestType === "SUBVAR") {
        eventDetails.push({
          subsequentlyVaried: {
            request: convertPncToLeds(String(event.attributes?.["PNC Request Message"]), "Subsequently Varied"),
            timestamp: event.timestamp
          }
        })
      } else if (requestType === "SENDEF") {
        eventDetails.push({
          sentenceDeferred: {
            request: convertPncToLeds(String(event.attributes?.["PNC Request Message"]), "Sentence Deferred"),
            timestamp: event.timestamp
          }
        })
      } else if (requestType === "PENHRG") {
        eventDetails.push({
          penaltyHearing: {
            request: String(event.attributes?.["PNC Request Message"]),
            timestamp: event.timestamp
          }
        })
      }
    })

  for (const queryOrUpdate of eventDetails) {
    if (queryOrUpdate.queryResponse) {
      output.operations.push("Query")
      await generateLinesForQuery(queryOrUpdate, addLine)
    } else if (queryOrUpdate.addDisposal) {
      output.operations.push("Disposal Results")
      await generateLinesForAddDisposal(queryOrUpdate, addLine)
    } else if (queryOrUpdate.remand) {
      output.operations.push("Remand")
      await generateLinesForRemand(queryOrUpdate, addLine)
    } else if (queryOrUpdate.subsequentlyVaried) {
      output.operations.push("Subsequently Varied")
      await generateLinesForSubsequentDisposalResult(queryOrUpdate, "Subsequently Varied", addLine)
    } else if (queryOrUpdate.sentenceDeferred) {
      output.operations.push("Sentence Deferred")
      await generateLinesForSubsequentDisposalResult(queryOrUpdate, "Sentence Deferred", addLine)
    } else if (queryOrUpdate.penaltyHearing) {
      output.operations.push("Penalty Hearing")
      addLine("=============================================")
      addLine("Bichard Update: Penalty hearing")
      addLine("=============================================")
      addLine(`\n${queryOrUpdate.penaltyHearing}`, true, true)
    }

    addLine("")
  }

  const metadataLines = [
    `Message ID: ${messageId}`,
    `SPI S3 Path: ${s3Path}`,
    `ASN: ${output.asn}`,
    `Operations: ${output.operations.join(", ")}`,
    "\n"
  ]
  output.summary = metadataLines.concat(lines).join("\n")

  if (options?.doNotPrintSummary !== true) {
    console.log(output.summary)
  }

  return output
}

export default generateCaseSummary
