import {
    METRIC_INTENT_FAILED_FUNCTION_CALL,
    METRIC_INTENT_FUNCTION_CALL,
    METRIC_INTENT_SUCCESSFUL_FUNCTION_CALL,
    METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL,
    METRIC_MATRIX_CLIENT_FUNCTION_CALL,
    METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL
} from "./names";
import { IntentCallContext, MatrixClientCallContext } from "./contexts";

/**
 * Times a MatrixClient function call for metrics.
 * @category Metrics
 */
export function timedMatrixClientFunctionCall() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args: any[]) {
            const metrics = this.metrics;

            const context = metrics.assignUniqueContextId(<MatrixClientCallContext>{
                functionName: propertyKey,
                client: this,
            });
            metrics.start(METRIC_MATRIX_CLIENT_FUNCTION_CALL, context);

            let result;
            let exception;

            try {
                result = originalMethod.apply(this, args);
            } catch (e) {
                exception = e;
                result = Promise.reject(e);
            }

            let promise = result;
            if (!(result instanceof Promise) && result !== null && result !== undefined) {
                promise = Promise.resolve(result);
            }

            promise
                .then(() => metrics.increment(METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL, context, 1))
                .catch(() => metrics.increment(METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL, context, 1))
                .finally(() => metrics.end(METRIC_MATRIX_CLIENT_FUNCTION_CALL, context));

            if (exception) throw exception;
            return result;
        }
    };
}

/**
 * Times an Intent function call for metrics.
 * @category Metrics
 */
export function timedIntentFunctionCall() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args: any[]) {
            const metrics = this.metrics;

            const context = metrics.assignUniqueContextId(<IntentCallContext>{
                functionName: propertyKey,
                client: this.client,
                intent: this,
            });
            metrics.start(METRIC_INTENT_FUNCTION_CALL, context);

            let result;
            let exception;

            try {
                result = originalMethod.apply(this, args);
            } catch (e) {
                exception = e;
                result = Promise.reject(e);
            }

            let promise = result;
            if (!(result instanceof Promise) && result !== null && result !== undefined) {
                promise = Promise.resolve(result);
            }

            promise
                .then(() => metrics.increment(METRIC_INTENT_SUCCESSFUL_FUNCTION_CALL, context, 1))
                .catch(() => metrics.increment(METRIC_INTENT_FAILED_FUNCTION_CALL, context, 1))
                .finally(() => metrics.end(METRIC_INTENT_FUNCTION_CALL, context));

            if (exception) throw exception;
            return result;
        }
    };
}
