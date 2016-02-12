async function test() {
  try {
    try {
      await a();
    } finally {
      await b();
    }
  } finally {
    await c();
  }
}

async function test2() {
  try {
    await a();
  } finally {
    try {
      await b();
    } finally {
      await c();
    }
  }
}
