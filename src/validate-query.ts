import { type Request } from "express"

/**
 * Validate query parameters against allowed values.
 * @date 4/16/2024 - 11:10:34 AM
 * @export
 * @param {Request["query"]} query - The Express request query object.
 * @param {Record<string, string | AllowedValue | AllowedValueAny>} [allowedValues={}] - Allowed values for each query key.
 * @param {boolean isMissingRuleValid} [isMissingRuleValid=false] - If true, allows query keys not present in allowedValues.
 * @returns {boolean} - True if all query parameters are valid, false otherwise.
 */

type AllowedValue = {
	value: unknown
	required?: boolean
	minLength?: number
	exact?: boolean
}

type AllowedValueAny = {
	anyValue: true
	required?: boolean
}
export function validateQuery(
	query: Request["query"],
	allowedValues: Record<string, string | AllowedValue | AllowedValueAny> = {},
	isMissingRuleValid: boolean = false
): boolean {
	const isObject = (v: unknown): v is AllowedValue & AllowedValueAny => typeof v === "object" && v !== null && !Array.isArray(v)
	const allowedEntries = Object.entries(allowedValues)
	for (const [key, rule] of allowedEntries) {
		if (isObject(rule)) {
			if (rule.required && !(key in query)) return false
			if (typeof rule.minLength === "number" && typeof query[key] === "string" && query[key].length < rule.minLength) return false
		}
	}
	const queryEntries = Object.entries(query)
	const toLowerCase = (v: unknown, exact?: boolean) => (typeof v === "string" && !exact ? v.toLowerCase() : v)
	for (const [key, value] of queryEntries) {
		const found = allowedValues[key]
		if (!found && isMissingRuleValid === true) continue // no rule found & valid to have unaccounted for params
		const rule = isObject(found) ? found : ({ value: found } as AllowedValue & AllowedValueAny)
		if (rule.anyValue) continue
		if (toLowerCase(rule.value, rule.exact) !== toLowerCase(value, rule.exact)) return false
	}
	return true
}
