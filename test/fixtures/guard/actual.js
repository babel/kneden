async function test(a, b) {
  if (a === b) {
    return;
  }

  await someOp((a + b) / 2);
}
