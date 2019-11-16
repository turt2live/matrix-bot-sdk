/**
 * Default context for all metrics.
 * @category Metrics
 */
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
    functionName: string;
}
