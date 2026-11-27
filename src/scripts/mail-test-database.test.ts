import {expect,it} from 'vitest';
import {requireMailTestDatabase} from '../../scripts/mail-test-database';

it('refuses ambiguous database, alternate connection settings and production before any fixture call',()=>{
  const base='postgresql://fixture@127.0.0.1:54313/airmanager_test?schema=public';
  for(const overrides of [
    {DATABASE_URL:base+'other'}, {DATABASE_URL:'postgresql://localhost:54313/airmanager', TEST_DATABASE_URL:'postgresql://localhost:54313/airmanager'},
    {PGOPTIONS:'fixture'}, {PGHOSTADDR:'192.0.2.1'}, {PGSERVICE:'fixture'}, {NODE_ENV:'production'},
    {DATABASE_URL:base+'&host=elsewhere.invalid',TEST_DATABASE_URL:base+'&host=elsewhere.invalid'},
  ]) {
    let clients=0;
    expect(()=>{requireMailTestDatabase('integration',{DATABASE_URL:base,TEST_DATABASE_URL:base,...overrides});clients++;}).toThrow();
    expect(clients).toBe(0);
  }
  expect(requireMailTestDatabase('integration',{DATABASE_URL:base,TEST_DATABASE_URL:base})).toBe(base);
});
