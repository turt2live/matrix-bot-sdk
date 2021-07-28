import { IMetricListener } from "./IMetricListener";
import { IMetricContext } from "./contexts";
import { Intent, LogService, MatrixClient } from "..";

/**
 * Tracks metrics.
 * @category Metrics
 */
export class Metrics {

    private listeners: IMetricListener[] = [];
    private requestStartTimes: { [contextId: string]: number } = {};
    private uid = 0;

    /**
     * Creates a new Metrics handler with optional parent handler. When
     * a parent handler is defined, metrics will be automatically published
     * upwards to the parent.
     * @param {Metrics} parent Optional parent for upstream metrics.
     */
    constructor(parent: Metrics = null) {
        if (parent !== null) {
            this.registerListener({
                onIncrement(metricName: string, context: IMetricContext, amount: number) {
                    parent.listeners.forEach(h => h.onIncrement(metricName, context, amount));
                },
                onDecrement(metricName: string, context: IMetricContext, amount: number) {
                    parent.listeners.forEach(h => h.onDecrement(metricName, context, amount));
                },
                onReset(metricName: string, context: IMetricContext) {
                    parent.listeners.forEach(h => h.onReset(metricName, context));
                },
                onStartMetric(metricName: string, context: IMetricContext): void {
                    parent.listeners.forEach(h => h.onStartMetric(metricName, context));
                },
                onEndMetric(metricName: string, context: IMetricContext, timeMs: number): void {
                    parent.listeners.forEach(h => h.onEndMetric(metricName, context, timeMs));
                },
            });
        }
    }

    /**
     * Registers a metric listener.
     * @param {IMetricListener} listener The listener.
     */
    public registerListener(listener: IMetricListener) {
        this.listeners.push(listener);
    }

    /**
     * De-registers a metric listener.
     * @param {IMetricListener} listener The listener.
     */
    public unregisterListener(listener: IMetricListener) {
        const idx = this.listeners.indexOf(listener);
        if (idx !== -1) this.listeners.splice(idx, 1);
    }

    /**
     * Starts a timer on a metric.
     * @param {string} metricName The metric name.
     * @param {IMetricContext} context The metric context. Expected to have a unique ID.
     */
    public start(metricName: string, context: IMetricContext) {
        this.requestStartTimes[context.uniqueId] = new Date().getTime();
        this.listeners.forEach(h => h.onStartMetric(metricName, context));
    }

    /**
     * Ends a timer on a metric.
     * @param {string} metricName The metric name.
     * @param {IMetricContext} context The metric context. Expected to have a unique ID.
     */
    public end(metricName: string, context: IMetricContext) {
        const timeMs = (new Date().getTime()) - this.requestStartTimes[context.uniqueId];
        delete this.requestStartTimes[context.uniqueId];
        this.listeners.forEach(h => h.onEndMetric(metricName, context, timeMs));

        // Trim the context for logging
        const trimmedContext = {};
        for (const key of Object.keys(context)) {
            if (key === 'client') {
                const client = context[key];
                trimmedContext[key] = `<MatrixClient ${client['userId'] || 'NoCachedUserID'}>`;
            } else if (key === 'intent') {
                const intent = context[key];
                trimmedContext[key] = `<Intent ${intent['userId'] || 'NoImpersonatedUserID'}>`;
            } else {
                trimmedContext[key] = context[key];
            }
        }

        LogService.trace("Metrics", metricName, trimmedContext, timeMs);
    }

    /**
     * Increments a metric.
     * @param {string} metricName The metric name.
     * @param {IMetricContext} context The metric context. Expected to have a unique ID.
     * @param {number} amount The amount.
     */
    public increment(metricName: string, context: IMetricContext, amount: number) {
        this.listeners.forEach(h => h.onIncrement(metricName, context, amount));
    }

    /**
     * Decrements a metric.
     * @param {string} metricName The metric name.
     * @param {IMetricContext} context The metric context. Expected to have a unique ID.
     * @param {number} amount The amount.
     */
    public decrement(metricName: string, context: IMetricContext, amount: number) {
        this.listeners.forEach(h => h.onDecrement(metricName, context, amount));
    }

    /**
     * Resets a metric.
     * @param {string} metricName The metric name.
     * @param {IMetricContext} context The metric context. Expected to have a unique ID.
     */
    public reset(metricName: string, context: IMetricContext) {
        this.listeners.forEach(h => h.onReset(metricName, context));
    }

    /**
     * Assigns a unique ID to the context object, returning it back.
     * @param {IMetricContext} context The context to modify.
     * @returns {IMetricContext} The provided context.
     */
    public assignUniqueContextId(context: IMetricContext): IMetricContext {
        context.uniqueId = `${new Date().getTime()}-${this.uid++}`;
        return context;
    }
}
