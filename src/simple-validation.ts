/**
 * Validate the 'order' parameter of a child space entry. It must be a
 * string between the range of \x20 - \x7F and contain no more than 50
 * characters.
 * @param {string} order The 'order' parameter of a m.space.child
 * @throws {Error} If the string is not valid
 * @returns {boolean} True if the string is valid
 */
export function validateSpaceOrderString(order: string): true {
    if (typeof(order) !== 'string') {
        // Just in case, even though TS should catch this.
        throw Error('order is not a string');
    }

    if (order.length === 0) {
        throw Error('order cannot be empty');
    }

    if (order.length > 50) {
        throw Error('order is more than 50 characters and is disallowed');
    }

    if (!order.match(/^[\x20-\x7E]+$/)) {
        // String must be between this range
        throw Error('order contained characters outside the range of the spec.');
    }

    return true;
}
