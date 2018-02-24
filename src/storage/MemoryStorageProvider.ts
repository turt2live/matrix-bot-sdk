import { IStorageProvider } from "./IStorageProvider";
import { IFilterInfo } from "../IFilter";

export class MemoryStorageProvider implements IStorageProvider {

    private syncToken: string;

    setSyncToken(token: string|null): void {
        this.syncToken = token;
    }

    getSyncToken(): string|null {
        return this.syncToken;
    }

    setFilter(filter: IFilterInfo): void {
        // Do nothing
    }

    getFilter(): IFilterInfo {
        return null;
    }
}