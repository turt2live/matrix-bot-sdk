export type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json };

export interface IJsonType {
    [key: string]: Json;
}
