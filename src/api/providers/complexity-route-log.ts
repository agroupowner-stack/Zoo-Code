/**
 * In-memory ring buffer of complexity route decisions for slices B/C.
 * Also emits a greppable structured JSON line via console.info.
 */

import { createComplexityRouteDecisionEvent, type ComplexityRouteDecisionEvent } from "@roo-code/types"

export const COMPLEXITY_ROUTE_LOG_PREFIX = "[complexity-router]"

const DEFAULT_CAPACITY = 500

let capacity = DEFAULT_CAPACITY
let buffer: ComplexityRouteDecisionEvent[] = []

/** Test helper — clear the ring buffer. */
export function clearComplexityRouteDecisions(): void {
	buffer = []
}

/** Test / config helper — resize capacity (trims oldest if needed). */
export function setComplexityRouteLogCapacity(next: number): void {
	capacity = Math.max(1, next)
	if (buffer.length > capacity) {
		buffer = buffer.slice(buffer.length - capacity)
	}
}

export function appendComplexityRouteDecision(
	partial: Omit<ComplexityRouteDecisionEvent, "schemaVersion" | "ts"> & { ts?: string },
): ComplexityRouteDecisionEvent {
	const event = createComplexityRouteDecisionEvent(partial)
	buffer.push(event)
	if (buffer.length > capacity) {
		buffer = buffer.slice(buffer.length - capacity)
	}
	console.info(`${COMPLEXITY_ROUTE_LOG_PREFIX} ${JSON.stringify(event)}`)
	return event
}

export function getComplexityRouteDecisions(filter?: { taskId?: string }): ComplexityRouteDecisionEvent[] {
	if (!filter?.taskId) {
		return [...buffer]
	}
	return buffer.filter((e) => e.taskId === filter.taskId)
}
