import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs';
import external from 'rollup-plugin-peer-deps-external';
import resolve from 'rollup-plugin-node-resolve';

import replace from '@rollup/plugin-replace';

import pkg from './package.json';

const builtins = require('builtins');

export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    {
      file: pkg.module,
      format: 'es',
      exports: 'named',
      sourcemap: true,
    },
  ],
  external: builtins(),
  plugins: [
    external(),
    replace({
      delimiters: ['', ''],
      values: {
        "require('readable-stream/transform')": "require('stream').Transform",
        'require("readable-stream/transform")': "require('stream').Transform",
        "require('readable-stream/duplex')": "require('stream').Duplex",
        'require("readable-stream/duplex")': "require('stream').Duplex",
        "require('readable-stream/writable')": "require('stream').Writable",
        'require("readable-stream/writable")': "require('stream').Writable",
        'readable-stream': 'stream',
        'if(process.argv[1] && process.argv[1].match(__filename))': 'if(false)',
      },
    }),
    resolve({
      preferBuiltins: true,
    }),
    typescript({
      rollupCommonJSResolveHack: true,
      exclude: '**/__tests__/**',
      clean: true,
    }),
    commonjs({
      include: ['node_modules/**'],
    }),
  ],
};
