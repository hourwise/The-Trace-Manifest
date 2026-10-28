/** Explicit disposable CLI fixture, never an acquisition or remote database. */
import {existsSync,realpathSync} from 'node:fs';
import {dirname} from 'node:path';
import {database,fixtureBundle} from './helpers';
import {writeFileSync,readFileSync} from 'node:fs';
import {sha256} from '../../../src/lib/server/news-import/runtime/primitives';
const path=process.argv[2];if(!path||!/^D:[\\/]/i.test(path)||existsSync(path)||!/^D:[\\/]/i.test(realpathSync.native(dirname(path))))throw new Error('New explicit direct D: fixture file required');
const b=fixtureBundle();writeFileSync('tests/fixtures/news-import/identities.json',JSON.stringify({schema:'trace-news-ci-fictional-fixture-v1',bundle_sha256:b.bundle_sha256,payload_sha256:b.payload_sha256,xml_sha256:sha256(readFileSync('tests/fixtures/news-import/rss-template.xml'))},null,2)+'\n');
const db=database();try{db.sqlite.exec("INSERT INTO editorial_candidates(id,intake_type,submitted_url,source_hash,state,created_by) VALUES ('legacy-cli','manual_url','https://alpha.trace.test/old?utm_source=x','ORIGINAL_HASH','new','local-fixture'),('invalid-cli','manual_url','javascript:x','ORIGINAL_INVALID_HASH','new','local-fixture')");db.sqlite.prepare('VACUUM INTO ?').run(path);}finally{db.close();}
