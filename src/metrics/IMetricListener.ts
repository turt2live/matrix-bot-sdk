import { IMetricContext } from "./contexts";

/**
 * A simple interface for listening for Metric updates. Should be plugged into
 * something like Prometheus for recording.
 *
 * Metric names are defined in metric_names.ts - see documentation on the name
 * for what the context object contains. All metrics have a context object,
 * with applicable interface. See the IMetricContext interface for more
 * information.
 * @category Metrics
 */
export interface IMetricListener {
    /**
     * Called when the given metric should start being tracked. Will be
     * paired with a matching onEndMetric() call.
     * @param {string} metricName The metric being called.
     * @param {IMetricContext} context Context for the metric. Never null.
     */
    onStartMetric(metricName: string, context: IMetricContext): void;

    /**
     * Called when the given metric should stop being tracked. Will have
     * started with a matching onStartMetric() call.
     * @param {string} metricName The metric being called.
     * @param {any} context Context for the metric. Never null.
     * @param {number} timeMs The measured time in milliseconds between
     * the start and end.
     */
    onEndMetric(metricName: string, context: IMetricContext, timeMs: number): void;

    /**
     * Called when a linear metric (increasing/decreasing number) should
     * be incremented.
     * @param {string} metricName The metric being called.
     * @param {IMetricContext} context Context for the metric. Never null.
     * @param {number} amount The amount to add. Never negative or zero.
     */
    onIncrement(metricName: string, context: IMetricContext, amount: number);

    /**
     * Called when a linear metric (increasing/decreasing number) should
     * be decremented.
     * @param {string} metricName The metric being called.
     * @param {IMetricContext} context Context for the metric. Never null.
     * @param {number} amount The amount to subtract. Never negative or zero.
     */
    onDecrement(metricName: string, context: IMetricContext, amount: number);

    /**
     * Called when a linear metric (increasing/decreasing number) should
     * be reset to zero.
     * @param {string} metricName The metric being called.
     * @param {IMetricContext} context Context for the metric. Never null.
     */
    onReset(metricName: string, context: IMetricContext);
}
