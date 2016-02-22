function handler() {
    var response, json;
    return Promise.resolve().then(function () {
        return fetch('http://address');
    }).then(function (_resp) {
        response = _resp;

        if (!response.ok) {
            return null; // 1
        } else {
            return Promise.resolve().then(function () {
                return response.json();
            }).then(function (_resp) {
                json = _resp; // 2

                return {
                    a: 3
                };
            });
        }
    });
}
