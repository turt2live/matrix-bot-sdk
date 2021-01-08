/**
 * Default context for all metrics.
 * @category Metrics
 */
import { MatrixClient } from "../MatrixClient";
import { Intent } from "../appservice/Intent";
import { IdentityClient } from "../identity/IdentityClient";

export interface IMetricContext {
    /**
     * Unique identifier for the context object. Used to differentiate
     * contexts over a start/end event.
     */
    uniqueId: string;
}

/**
 * Metric context for function call metrics.
 * @category Metrics
 */
export interface FunctionCallContext extends IMetricContext {
    /**
     * The function name being called
     */
    functionName: string;
}

/**
 * Metric context for metrics from a MatrixClient
 * @category Metrics
 */
export interface MatrixClientCallContext extends FunctionCallContext {
    /**
     * The client that raised the metric.
     */
    client: MatrixClient;
}

/**
 * Metric context for metrics from an IdentityClient
 * @category Metrics
 */
export interface IdentityClientCallContext extends FunctionCallContext {
    client: IdentityClient;
}

/**
 * Metric context for metrics from an Intent
 * @category Metrics
 */
export interface IntentCallContext extends MatrixClientCallContext {
    /**
     * The intent that is raising the metric.
     */
    intent: Intent;
}
