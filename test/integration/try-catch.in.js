async function test() {
  try {
    this.would.fail;
  } catch (err) {
    await postErrorMessage('http://my.webservice/error', err);
  }
}
