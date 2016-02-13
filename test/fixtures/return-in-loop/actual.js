/* eslint no-constant-condition: 0 */

async function test() {
  while (true) {
    if (await a()) {
      return "now";
    }
  }
}
