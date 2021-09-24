export interface MSC3395SyntheticEvent<T extends Object | unknown> {
    type: string;
    content: T;
}