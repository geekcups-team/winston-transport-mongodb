/* eslint-disable import/no-extraneous-dependencies */
import Transport from 'winston-transport';
import mongodb, { MongoClient } from 'mongodb';
import util from 'util';
import { TransportOption, LogSplitEnum } from './transportOption';

export { TransportOption, LogSplitEnum } from './transportOption';

const findCollection = async (db: mongodb.Db, name: string) => {
  const collections = await db.listCollections({ name }).toArray();
  if (collections.length > 0) {
    return collections[0];
  }
  return null;
};

interface MetaSchema {
  name: string
  start: Date
  end: Date | null
}

export class MongoDBTransport extends Transport {
  private initializePromise : Promise<void>

  // @ts-ignore
  private name: string;

  private metaCollectionName: string

  private logCollectionPrefix: string

  private logSplit: LogSplitEnum | number

  private additionalLogIndexes: mongodb.IndexSpecification[]

  private mongoClient: MongoClient | Promise<MongoClient>

  private db: mongodb.Db

  constructor(options: TransportOption) {
    super(options);
    this.name = options.name ?? 'mongodb';
    this.logCollectionPrefix = options.logCollectionPrefix ?? 'log';
    this.logSplit = options.logSplit ?? LogSplitEnum.NONE;
    this.metaCollectionName = options.metaCollectionName ?? 'meta';
    this.additionalLogIndexes = options.additionalLogIndexes ?? [];
    if (options.db instanceof MongoClient) {
      this.mongoClient = options.db;
    }
    else {
      const dbOptions = options.dbOptions
        ?? { poolSize: 2, autoReconnect: true, useNewUrlParser: true };
      this.mongoClient = mongodb.connect(options.db, dbOptions);
    }

    this.initializePromise = this.init();
  }

  private async createMetaCollection(db: mongodb.Db) {
    const metaCollection = await db.createCollection<MetaSchema>(this.metaCollectionName);
    await metaCollection.createIndexes([
      {
        key: { name: 1 },
        unique: true,
      },
      {
        key: { start: -1 },
        unique: true,
      },
      {
        key: { end: -1 },
        unique: true,
      },
    ]);
    return metaCollection;
  }

  private async init() {
    const db = (await this.mongoClient).db();
    let metaCollection = await findCollection(db, this.metaCollectionName);
    if (!metaCollection) {
      metaCollection = await this.createMetaCollection(db);
    }
    this.db = db;
  }

  private getMetaCollection() {
    return this.db.collection(this.metaCollectionName) as mongodb.Collection<MetaSchema>;
  }

  private isLogCollectionValid(metaEntry: MetaSchema | null, now: Date) {
    if (!metaEntry) {
      return false;
    }

    const nowDay = now.getDate();
    const nowMonth = now.getMonth();
    const nowYear = now.getFullYear();

    const startDay = metaEntry.start.getDate();
    const startMonth = metaEntry.start.getMonth();
    const startYear = metaEntry.start.getFullYear();

    switch (this.logSplit) {
      case LogSplitEnum.NONE: {
        return true;
      }
      case LogSplitEnum.DAY: {
        return (
          nowDay === startDay
          && nowMonth === startMonth
          && nowYear === startYear
        );
      }
      case LogSplitEnum.MONTH: {
        return (
          nowMonth === startMonth
          && nowYear === startYear
        );
      }
      case LogSplitEnum.YEAR: {
        return (
          nowYear === startYear
        );
      }
      default: {
        const maxDate = new Date(now);
        maxDate.setTime(maxDate.getTime() + this.logSplit);
        return now.valueOf() <= maxDate.valueOf();
      }
    }
  }

  private async findOrCreateLogCollection(now: Date) {
    const lastLogCollection = await this.getMetaCollection().findOne({
      end: null,
    });

    if (this.isLogCollectionValid(lastLogCollection, now)) {
      return this.db.collection(lastLogCollection!.name);
    }

    const newLogCollectionName = `${this.logCollectionPrefix}${now.valueOf()}`;
    const newLogCollection = await this.db.createCollection(newLogCollectionName);
    await newLogCollection.createIndexes([
      {
        key: {
          timestamp: 1,
        },
      },
      ...this.additionalLogIndexes,
    ]);
    if (lastLogCollection) {
      await this.getMetaCollection().updateOne(
        { name: lastLogCollection.name },
        { $set: { end: now } },
      );
    }
    await this.getMetaCollection().insertOne({
      name: newLogCollectionName,
      start: now,
      end: null,
    });

    return newLogCollection;
  }

  private async logAsync(info: any, callback: (error?: Error, result?: boolean) => void) {
    await this.initializePromise;
    const now = new Date();
    const logCollection = await this.findOrCreateLogCollection(now);
    const entry = {
      timestamp: now,
      level: info.level,
      message: util.format(info.message, ...(info.splat || [])),
      meta: info.meta,

    };
    try {
      await logCollection.insertOne(entry);
      this.emit('logged');
      callback(undefined, true);
    }
    catch (e) {
      this.emit('error', e);
      callback(e);
    }
  }

  log(info: any, callback: (error?: Error, result?: boolean) => void | null) {
    const emptyCallback = () => {};
    this.logAsync(info, callback || emptyCallback);
  }

  async queryAsync(options: any, callback: (error?: Error, result?: any) => void) {
    await this.initializePromise;
    const {
      from,
      to,
      query,
      fields,
    } = options || {};

    const realFields = fields
    || [
      'message',
      'timestamp',
      'level',
      'meta',
    ];

    const projection = realFields.reduce((acc: any, field: string) => {
      acc[field] = 1;
      return acc;
    }, {});

    const queryOptions = {
      sort: {
        timestamp: -1,
      },
      projection,
    };

    let metaCollectionFilter = {};
    let logFilter = query;
    if (from || to) {
      const timestampFilter = [];
      if (from) {
        timestampFilter.push({ timestamp: { $gte: from } });
      }
      if (to) {
        timestampFilter.push({ timestamp: { $lte: to } });
      }
      logFilter = {
        $and: [
          query || {},
          ...timestampFilter,
        ],
      };

      const realFrom = from || new Date(0);
      const realTo = to || new Date();

      metaCollectionFilter = {
        $or: [
          { start: { $gte: realFrom }, end: { $lte: realTo } },
          { start: { $gte: realFrom }, end: null },
          { start: { $gte: realTo }, end: null },
        ],
      };
    }

    const metaEntries = await this.getMetaCollection()
      .find(metaCollectionFilter, { projection: { name: 1 } }).toArray();
    const logCollectionNames = metaEntries.map((me) => me.name);

    const logPromises = logCollectionNames.map(async (logCollectionName) => {
      const logCollection = this.db.collection(logCollectionName);
      const result = await logCollection.find(logFilter, queryOptions).toArray();
      return result;
    });

    try {
      const queryResults = await Promise.all(logPromises);
      const finalResult = queryResults.reduce((acc, result) => [
        ...acc,
        ...result,
      ], []);
      callback(undefined, finalResult);
    }
    catch (e) {
      callback(e);
    }
  }

  query(options: any, callback: (error?: Error, result?: any) => void | null) {
    const emptyCallback = () => {};
    this.queryAsync(options, callback || emptyCallback);
  }
}
