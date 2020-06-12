# winston

A MongoDB transport for [winston][0].

Current version supports only mongodb driver version 3.x and winston 3.x.

## Usage
``` js
const { MongoDBTransport, LogSplitEnum } = require('@geekcups/winston-transport-mongodb');

const mongoTransport = new MongoDBTransport({
  db: dbUrl,
  dbOptions: {
    poolSize: 3,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
  logSplit: LogSplitEnum.DAY,
});

const logger = winston.createLogger({
  level: 'info',
  transports: [
    mongoTransport,
  ]
});
```

name?: string,
  db: string | MongoClient
  dbOptions?: MongoClientOptions
  metaCollectionName?: string
  logCollectionPrefix?: string
  additionalLogIndexes?: IndexSpecification[]
  logSplit?: LogSplitEnum | number,

The MongoDB transport takes the following options. 'db' is required:

* __db:__ MongoDB connection uri or pre-connected `MongoClient`.
* __options:__ MongoDB connection parameters (optional, defaults to
`{poolSize: 2, autoReconnect: true, useNewUrlParser: true}`).
* __metaCollectionName__: The name of the meta collection that contain the split information,
defaults to 'meta'.
* __name:__ Transport instance identifier. Useful if you need to create multiple
MongoDB transports.
* __logCollectionPrefix:__ Prefix name for log collections, defaults to 'log'.
* __additionalLogIndexes:__ MongoDB IndexSpecification array for additional log collection indexes (usefull if you need to index meta fields).
* __logSplit:__ Strategy for split log collection. You can split for default enums (LogSplitEnum.NONE, LogSplitEnum.DAY, LogSplitEnum.MONTH, LogSplitEnum.YEAR) or with number of milliseconds. The transport create a new log collection when a new log entry exceeds the logSplit time

*Metadata:* Logged as a native JSON object in 'meta' property.

## Querying

Besides supporting the main options from winston, this transport supports the
following extra options:

* __from:__ Start date of query. Can be null.
* __to:__ End date of query. Can be null.
* __query:__ Extra query for log collection. For example you can query for meta field here. If you specify from and to you don't need to specify timestamp query here.

## Installation

``` bash
  $ npm install winston
  $ npm install mongodb
  $ npm install @geekcups/winston-transport-mongodb
```