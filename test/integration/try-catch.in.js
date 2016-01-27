async function test() {
  try {
    going.to.fail;
  } catch (err) {
    await postErrorMessage('http://my.webservice/error', err);
  }
}
