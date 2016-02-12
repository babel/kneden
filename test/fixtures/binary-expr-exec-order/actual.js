/* eslint no-empty: 0 */

async function test() {
  if(c() === await d()) {}

  return a() + await b();
}
