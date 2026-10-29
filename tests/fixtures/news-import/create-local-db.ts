/** Explicit disposable CLI fixture, never an acquisition or remote database. */
import {existsSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {database} from './helpers';
// An explicit disposable output only. Database setup never regenerates tracked identities.
const path=process.argv[2];if(!path||!isAbsolute(path)||existsSync(path)||!realpathSync.native(dirname(path)))throw new Error('New explicit absolute fixture file with existing parent required');
const db=database();try{db.sqlite.exec("INSERT INTO editorial_candidates(id,intake_type,submitted_url,source_hash,state,created_by) VALUES ('legacy-cli','manual_url','https://alpha.trace.test/old?utm_source=x','ORIGINAL_HASH','new','local-fixture'),('invalid-cli','manual_url','javascript:x','ORIGINAL_INVALID_HASH','new','local-fixture')");db.sqlite.prepare('VACUUM INTO ?').run(path);}finally{db.close();}
