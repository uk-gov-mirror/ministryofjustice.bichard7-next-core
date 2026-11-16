import type { PostgresError, Sql } from "postgres"

import type ErrorListRecord from "../../types/ErrorListRecord"
import type PhaseResult from "../../types/PhaseResult"

import convertResultToErrorListRecord from "./convertResultToErrorListRecord"

const insertErrorListRecord = async (db: Sql, result: PhaseResult): Promise<number> => {
  const errorListRecord = convertResultToErrorListRecord(result)
  let newRecordId: number | undefined
  try {
    if (errorListRecord.postcode) {
      errorListRecord.police_force_area = db`(
      SELECT police_force_area 
      FROM br7own.ons_postcode_mappings 
      WHERE postcode = ${errorListRecord.postcode} 
      LIMIT 1)` as unknown as string
    }

    const newRecordResult = await db<ErrorListRecord[]>`
      INSERT INTO br7own.error_list ${db(errorListRecord)} RETURNING *`

    if (!newRecordResult[0].error_id) {
      throw new Error("Error inserting to error_list table")
    }

    newRecordId = newRecordResult[0].error_id
  } catch (e) {
    const error = e as PostgresError
    if (error.severity !== "NOTICE") {
      console.error(e)
      throw error
    }
  }

  if (newRecordId === undefined) {
    throw new Error("Error inserting new error_list record")
  }

  return newRecordId
}

export default insertErrorListRecord
