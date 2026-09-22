import { z } from "zod"

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	API_MODEL_ID_FIELD,
	apiModelIdProviderModelShape,
	createModelIdAccessor,
	createProviderDefinition,
} from "./common.js"

export const xaiProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.xai,
	modelIdKey: API_MODEL_ID_FIELD,
	getModelId: createModelIdAccessor(API_MODEL_ID_FIELD),
	schema: {
		...apiModelIdProviderModelShape,
		xaiApiKey: z.string().optional(),
		/** When true, route each request to simple/coding/architecture models. Default false. */
		complexityRoutingEnabled: z.boolean().optional(),
		complexityRoutingSimpleModel: z.string().optional(),
		complexityRoutingCodingModel: z.string().optional(),
		complexityRoutingArchitectureModel: z.string().optional(),
		complexityRoutingArchitectureProvider: z.enum(["xai", "anthropic"]).optional(),
		complexityRoutingArchitectureAnthropicModel: z.string().optional(),
		/** Escalate on provider/API error. Default true when routing enabled / undefined. */
		complexityRoutingEscalateOnError: z.boolean().optional(),
		/** Escalate when consecutiveMistakeCount increments. Default true when undefined. */
		complexityRoutingEscalateOnConsecutiveMistakes: z.boolean().optional(),
	},
})
