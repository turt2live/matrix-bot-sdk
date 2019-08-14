/**
 * Time-series metric for how long a function call takes on MatrixClient. Uses a FunctionCallContext.
 */
export const METRIC_MATRIX_CLIENT_FUNCTION_CALL = "matrix_client_function_call";

/**
 * Counter metric for failed function calls on a MatrixClient. Uses a FunctionCallContext.
 */
export const METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL = "matrix_client_failed_function_call";

/**
 * Counter metric for successful function calls on a MatrixClient. Uses a FunctionCallContext.
 */
export const METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL = "matrix_client_successful_function_call";
