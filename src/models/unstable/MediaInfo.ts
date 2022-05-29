/**
 * This interface implements the schema defined in [MSC2380](https://github.com/matrix-org/matrix-doc/pull/2380).
 */
export interface MSC2380MediaInfo {
    content_type: string;
    width: number | undefined;
    height: number | undefined;
    size: number;
    thumbnails?: {
        width: number;
        height: number;
        ready: boolean;
    }[];
    duration?: number;
}
