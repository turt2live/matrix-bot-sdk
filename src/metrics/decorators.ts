import {
    METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL,
    METRIC_MATRIX_CLIENT_FUNCTION_CALL,
    METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL
} from "./names";
import { FunctionCallContext } from "./contexts";

export function timedMatrixClientFunctionCall() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args: any[]) {
            const metrics = this.metrics;

            const context = metrics.assignUniqueContextId(<FunctionCallContext>{functionName: propertyKey});
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
                .catch(() => metrics.increment(METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL, context, 1))
                .then(() => metrics.increment(METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL, context, 1))
                .finally(() => metrics.end(METRIC_MATRIX_CLIENT_FUNCTION_CALL, context));

            if (exception) throw exception;
            return result;
        }
    };
}
