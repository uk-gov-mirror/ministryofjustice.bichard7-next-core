import createDbConfig from "@moj-bichard7/common/db/createDbConfig"
import { type AnnotatedHearingOutcome } from "@moj-bichard7/common/types/AnnotatedHearingOutcome"
import postgres from "postgres"

import type { onsPostcodeMappingRow } from "../../schemas/onsPostcodeMapping"
import type ErrorListRecord from "../../types/ErrorListRecord"

import generateMockPhase1Result from "../../phase1/tests/helpers/generateMockPhase1Result"
import insertErrorListRecord from "./insertErrorListRecord"

const dbConfig = createDbConfig()
const db = postgres({
  ...dbConfig,
  types: {
    date: {
      to: 25,
      from: [1082],
      serialize: (x: string): string => x,
      parse: (x: string): Date => {
        return new Date(x)
      }
    }
  }
})

const record1: onsPostcodeMappingRow = { postcode: "SW1A 1AA", police_force_area: "E2300001" }
const record2: onsPostcodeMappingRow = { postcode: "M1 1AE", police_force_area: "E2300005" }

describe("insertErrorListRecord", () => {
  beforeAll(async () => {
    await db<onsPostcodeMappingRow[]>`INSERT INTO br7own.ons_postcode_mappings ${db([record1, record2])}`
  })

  beforeEach(async () => {
    await db`DELETE FROM br7own.error_list`
    jest.resetAllMocks()
  })

  afterAll(async () => {
    await db`DELETE FROM br7own.ons_postcode_mappings`
    await db.end()
  })

  it("should insert the result into the error_list table", async () => {
    const result = generateMockPhase1Result()
    const recordId = await insertErrorListRecord(db, result)

    expect(recordId).toBeDefined()

    const insertedRecord = (
      await db<ErrorListRecord[]>`
      SELECT * FROM br7own.error_list WHERE error_id = ${recordId}`
    )[0]

    const hearingOutcome = result.hearingOutcome as AnnotatedHearingOutcome
    const messageId = hearingOutcome.AnnotatedHearingOutcome.HearingOutcome.Hearing.SourceReference.UniqueID
    expect(insertedRecord.message_id).toBe(messageId)
  })

  it("should assign correct police force area code when valid postcode provided", async () => {
    const result = generateMockPhase1Result()

    result.hearingOutcome.AnnotatedHearingOutcome.HearingOutcome.Case.HearingDefendant.Address = {
      AddressLine1: "Line 1",
      AddressLine5: "SW1A 1AA"
    }

    const recordId = await insertErrorListRecord(db, result)

    const insertedRecord = (
      await db<ErrorListRecord[]>`
      SELECT * FROM br7own.error_list WHERE error_id = ${recordId}`
    )[0]

    expect(insertedRecord.police_force_area).toBe("E2300001")
  })

  it("should not assign police force area code when no postcode is provided", async () => {
    const result = generateMockPhase1Result()

    result.hearingOutcome.AnnotatedHearingOutcome.HearingOutcome.Case.HearingDefendant.Address = {
      AddressLine1: "Line 1",
      AddressLine5: "Line 2"
    }

    const recordId = await insertErrorListRecord(db, result)

    const insertedRecord = (
      await db<ErrorListRecord[]>`
      SELECT * FROM br7own.error_list WHERE error_id = ${recordId}`
    )[0]

    expect(insertedRecord.police_force_area).toBeNull()
  })

  it("should not assign police force area code when provided postcode doesn't exist in the mappings table", async () => {
    const result = generateMockPhase1Result()

    result.hearingOutcome.AnnotatedHearingOutcome.HearingOutcome.Case.HearingDefendant.Address = {
      AddressLine1: "Line 1",
      AddressLine5: "SW1A 1XX"
    }

    const recordId = await insertErrorListRecord(db, result)

    const insertedRecord = (
      await db<ErrorListRecord[]>`
      SELECT * FROM br7own.error_list WHERE error_id = ${recordId}`
    )[0]

    expect(insertedRecord.police_force_area).toBeNull()
  })
})
