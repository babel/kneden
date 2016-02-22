async function handler() {
    var response = await fetch('http://address');
    if (!response.ok) {
        return null; // 1
    }
    var json = await response.json(); // 2
    return {
      a: 3
    };
}
