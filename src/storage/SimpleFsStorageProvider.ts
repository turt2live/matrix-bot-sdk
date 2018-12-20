import { IStorageProvider } from "./IStorageProvider";
import { IFilterInfo } from "../IFilter";
import * as lowdb from "lowdb";
import * as FileSync from "lowdb/adapters/FileSync";

export class SimpleFsStorageProvider implements IStorageProvider {

    private db: any;

    constructor(filename: string) {
        const adapter = new FileSync(filename);
        this.db = lowdb(adapter);

        this.db.defaults({syncToken: null, filter: null}).write();
    }

    setSyncToken(token: string|null): void {
        this.db.set('syncToken', token).write();
    }

    getSyncToken(): string|null {
        return this.db.get('syncToken').value();
    }

    setFilter(filter: IFilterInfo): void {
        this.db.set('filter', filter);
    }

    getFilter(): IFilterInfo {
        return this.db.get('filter').value();
    }
}
