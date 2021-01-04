/**
 * Time-series metric for how long a function call takes on MatrixClient. Uses a MatrixClientCallContext.
 * @category Metrics
 */
export const METRIC_MATRIX_CLIENT_FUNCTION_CALL = "matrix_client_function_call";

/**
 * Counter metric for failed function calls on a MatrixClient. Uses a MatrixClientCallContext.
 * @category Metrics
 */
export const METRIC_MATRIX_CLIENT_FAILED_FUNCTION_CALL = "matrix_client_failed_function_call";

/**
 * Counter metric for successful function calls on a MatrixClient. Uses a MatrixClientCallContext.
 * @category Metrics
 */
export const METRIC_MATRIX_CLIENT_SUCCESSFUL_FUNCTION_CALL = "matrix_client_successful_function_call";

/**
 * Time-series metric for how long a function call takes on an IdentityClient. Uses an IdentityClientCallContext.
 * @category Metrics
 */
export const METRIC_IDENTITY_CLIENT_FUNCTION_CALL = "identity_client_function_call";

/**
 * Counter metric for failed function calls on an IdentityClient. Uses an IdentityClientCallContext.
 * @category Metrics
 */
export const METRIC_IDENTITY_CLIENT_FAILED_FUNCTION_CALL = "identity_client_failed_function_call";

/**
 * Counter metric for successful function calls on an IdentityClient. Uses an IdentityClientCallContext.
 * @category Metrics
 */
export const METRIC_IDENTITY_CLIENT_SUCCESSFUL_FUNCTION_CALL = "identity_client_successful_function_call";

/**
 * Time-series metric for how long a function call takes on an Intent. Uses a IntentCallContext.
 * @category Metrics
 */
export const METRIC_INTENT_FUNCTION_CALL = "intent_function_call";

/**
 * Counter metric for failed function calls on an Intent. Uses a IntentCallContext.
 * @category Metrics
 */
export const METRIC_INTENT_FAILED_FUNCTION_CALL = "intent_failed_function_call";

/**
 * Counter metric for successful function calls on an Intent. Uses a IntentCallContext.
 * @category Metrics
 */
export const METRIC_INTENT_SUCCESSFUL_FUNCTION_CALL = "intent_successful_function_call";
