import { EncryptedFile, MatrixClient } from ".";
import { MXCUrl } from "./models/MXCUrl";

export interface ContentScannerResult {
    info: string;
    clean: boolean;
}
export interface ContentScannerErrorResult {
    info: string;
    reason: string;
}

export class MatrixContentScannerError extends Error {
    constructor(public readonly body: ContentScannerErrorResult) {
        super(`Encountered error scanning content (${body.reason}): ${body.info}`);
    }
}

const errorHandler = (_response, errBody) => {
    return typeof (errBody) === "object" && 'reason' in errBody ?
        new MatrixContentScannerError(errBody as ContentScannerErrorResult) : undefined;
};

/**
 * API client for https://github.com/element-hq/matrix-content-scanner-python.
 */
export class MatrixContentScannerClient {
    constructor(public readonly client: MatrixClient) {

    }

    public async scanContent(mxcUrl: string): Promise<ContentScannerResult> {
        const { domain, mediaId } = MXCUrl.parse(mxcUrl);
        const path = `/_matrix/media_proxy/unstable/scan/${domain}/${mediaId}`;
        const res = await this.client.doRequest("GET", path, null, null, null, false, null, false, { errorHandler });
        return res;
    }

    public async scanContentEncrypted(file: EncryptedFile): Promise<ContentScannerResult> {
        // Sanity check.
        MXCUrl.parse(file.url);
        const path = `/_matrix/media_proxy/unstable/scan_encrypted`;
        const res = await this.client.doRequest("POST", path, null, { file }, null, false, null, false, { errorHandler });
        return res;
    }

    public async downloadContent(mxcUrl: string): ReturnType<MatrixClient["downloadContent"]> {
        const { domain, mediaId } = MXCUrl.parse(mxcUrl);
        const path = `/_matrix/media_proxy/unstable/download/${encodeURIComponent(domain)}/${encodeURIComponent(mediaId)}`;
        const res = await this.client.doRequest("GET", path, null, null, null, true, null, true, { errorHandler });
        return {
            data: res.body,
            contentType: res.headers["content-type"],
        };
    }

    public async downloadEncryptedContent(file: EncryptedFile): Promise<Buffer> {
        // Sanity check.
        MXCUrl.parse(file.url);
        const path = `/_matrix/media_proxy/unstable/download_encrypted`;
        const res = await this.client.doRequest("POST", path, undefined, {
            file,
        }, null, true, null, true, { errorHandler });
        return res.data;
    }
}
