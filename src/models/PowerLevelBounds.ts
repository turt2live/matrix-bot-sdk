/**
 * Information on the bounds of a power level change a user can apply.
 */
export interface PowerLevelBounds {
    /**
     * Whether or not the user can even modify the power level of the user. This
     * will be false if the user can't send power level events, or the user is
     * unobtainably high in power.
     */
    canModify: boolean;

    /**
     * The maximum possible power level the user can set on the target user.
     */
    maximumPossibleLevel: number;
}
