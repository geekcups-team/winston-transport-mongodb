/* eslint-disable import/no-extraneous-dependencies */
import Transport from 'winston-transport';
import { MongoClient, MongoClientOptions, IndexSpecification } from 'mongodb';

export enum LogSplitEnum {
  NONE,
  DAY,
  MONTH,
  YEAR,
}

export interface TransportOption extends Transport.TransportStreamOptions {
  name?: string,
  db: string | MongoClient
  dbOptions?: MongoClientOptions
  metaCollectionName?: string
  logCollectionPrefix?: string
  additionalLogIndexes?: IndexSpecification[]
  logSplit?: LogSplitEnum | number,
}
