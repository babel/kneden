'use strict';

var _utils = require('./utils');

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var db = void 0;

function shouldBeAdminParty(session) {
  session.info.should.eql({
    "authentication_handlers": ["api"],
    "authentication_db": "test"
  });
  session.userCtx.should.eql({
    "name": null,
    "roles": ["_admin"]
  });
  session.ok.should.be.ok;
}

function shouldNotBeLoggedIn(session) {
  session.info.should.eql({
    authentication_handlers: ["api"],
    authentication_db: "test"
  });
  session.userCtx.should.eql({
    name: null,
    roles: []
  });
  session.ok.should.be.ok;
}

function shouldBeSuccesfulLogIn(data, roles) {
  var copy = (0, _extend2.default)({}, data);
  // irrelevant
  delete copy.sessionID;
  copy.should.eql({
    "ok": true,
    "name": "username",
    "roles": roles
  });
}

function shouldBeLoggedIn(session, roles) {
  session.userCtx.should.eql({
    "name": "username",
    "roles": roles
  });
  session.info.authenticated.should.equal("api");
}

describe('SyncAuthTests', function () {
  beforeEach(function () {
    return Promise.resolve().then(function () {
      db = (0, _utils.setup)();
      return db.useAsAuthenticationDB({ isOnlineAuthDB: false });
    }).then(function (_resp) {
      _utils.should.not.exist(_resp);
    });
  });
  afterEach(_utils.teardown);

  it('should test the daemon', function () {
    // handled by beforeEach and afterEach
  });

  it('should not allow stopping usage as an auth db twice', function () {
    return Promise.resolve().then(function () {
      return db.stopUsingAsAuthenticationDB();
    }).then(function () {
      return (0, _utils.shouldThrowError)(function () {
        return db.stopUsingAsAuthenticationDB();
      });
    }).then(function () {
      return db.useAsAuthenticationDB();
    }).then(function () {});
  });

  it('should not allow using a db as an auth db twice', function () {
    return Promise.resolve().then(function () {
      return (0, _utils.shouldThrowError)(function () {
        return db.useAsAuthenticationDB();
      });
    }).then(function () {});
  });

  it('should have working db methods', function () {
    var signUpData, doc, session, logInData, session2, session3, logOutData, session4, logOutData2, error;
    return Promise.resolve().then(function () {
      return db.signUp("username", "password", { roles: ["test"] });
    }).then(function (_resp) {
      signUpData = _resp;

      signUpData.rev.indexOf("1-").should.equal(0);
      signUpData.ok.should.be.ok;
      signUpData.id.should.equal("org.couchdb.user:username");

      return db.get("org.couchdb.user:username");
    }).then(function (_resp) {
      doc = _resp;

      doc._rev.indexOf("1-").should.equal(0);
      doc.should.have.property("derived_key");
      doc.iterations.should.equal(10);
      doc.name.should.equal("username");
      doc.password_scheme.should.equal("pbkdf2");
      doc.roles.should.eql(["test"]);
      doc.should.have.property("salt");
      doc.type.should.equal("user");

      doc.should.not.have.property("password");

      return db.session();
    }).then(function (_resp) {
      session = _resp;

      shouldBeAdminParty(session);

      return db.logIn("username", "password");
    }).then(function (_resp) {
      logInData = _resp;

      shouldBeSuccesfulLogIn(logInData, ["test"]);

      return db.session();
    }).then(function (_resp) {
      session2 = _resp;

      shouldBeLoggedIn(session2, ["test"]);

      return db.multiUserSession();
    }).then(function (_resp) {
      session3 = _resp;

      shouldBeAdminParty(session3);

      return db.logOut();
    }).then(function (_resp) {
      logOutData = _resp;

      logOutData.ok.should.be.ok;
      return db.session();
    }).then(function (_resp) {
      session4 = _resp;

      shouldBeAdminParty(session4);

      //should also give a {ok: true} when not logged in.
      return db.logOut();
    }).then(function (_resp) {
      logOutData2 = _resp;

      logOutData2.ok.should.be.ok;

      return (0, _utils.shouldThrowError)(function () {
        return db.logIn("username", "wrongPassword");
      });
    }).then(function (_resp) {
      error = _resp;

      error.status.should.equal(401);
      error.name.should.equal("unauthorized");
      error.message.should.equal("Name or password is incorrect.");
    });
  });

  it('should support sign up without roles', function () {
    var result, resp2;
    return Promise.resolve().then(function () {
      return db.signUp("username", "password");
    }).then(function (_resp) {
      result = _resp;

      result.ok.should.be.ok;

      return db.get("org.couchdb.user:username");
    }).then(function (_resp) {
      resp2 = _resp;

      resp2.roles.should.eql([]);
    });
  });

  it('should validate docs', function () {
    var error, resp;
    return Promise.resolve().then(function () {
      return (0, _utils.shouldThrowError)(function () {
        return db.post({});
      });
    }).then(function (_resp) {
      error = _resp;

      error.status.should.equal(403);

      return db.bulkDocs([{}]);
    }).then(function (_resp) {
      resp = _resp;

      resp[0].status.should.equal(403);
    });
  });

  it('should handle conflicting logins', function () {
    var doc1, doc2, error;
    return Promise.resolve().then(function () {
      doc1 = {
        _id: "org.couchdb.user:test",
        _rev: "1-blabla",
        type: "user",
        name: "test",
        roles: []
      };
      doc2 = (0, _extend2.default)({}, doc1);

      doc2._rev = "2-something";
      //generate conflict
      return db.bulkDocs([doc1, doc2], { new_edits: false });
    }).then(function () {
      return (0, _utils.shouldThrowError)(function () {
        return db.logIn("test", "unimportant");
      });
    }).then(function (_resp) {
      error = _resp;


      error.status.should.equal(401);
      error.name.should.equal("unauthorized");
      error.message.should.contain("conflict");
    });
  });

  it('should not accept invalid session ids', function () {
    var err;
    return Promise.resolve().then(function () {
      return (0, _utils.shouldThrowError)(function () {
        return Promise.resolve().then(function () {
          return db.multiUserSession('invalid-session-id');
        }).then(function () {});
      });
    }).then(function (_resp) {
      err = _resp;

      err.status.should.equal(400);
      err.name.should.equal('bad_request');
      err.message.should.contain('Malformed');
    });
  });

  afterEach(function () {
    return Promise.resolve().then(function () {
      return db.stopUsingAsAuthenticationDB();
    }).then(function (_resp) {
      _utils.should.not.exist(_resp);
    });
  });
});

describe('AsyncAuthTests', function () {
  beforeEach(function () {
    db = (0, _utils.setup)();
  });
  afterEach(_utils.teardown);
  it('should suport the basics', function (done) {
    function cb(err) {
      db.stopUsingAsAuthenticationDB();
      done(err);
    }
    db.useAsAuthenticationDB(cb);
  });
});

describe('AsyncAuthTestsWithoutDaemon', function () {
  beforeEach(function () {
    db = (0, _utils.setup)();
  });
  afterEach(_utils.teardown);

  it('should be impossible to use the various exposed methods', function () {
    _utils.should.not.exist(db.signUp);
    _utils.should.not.exist(db.session);
    _utils.should.not.exist(db.logIn);
    _utils.should.not.exist(db.logOut);
  });

  it('should hash admin passwords', function () {
    var admins, resp;
    return Promise.resolve().then(function () {
      admins = {
        test: "-pbkdf2-0abe2dcd23e0b6efc39004749e8d242ddefe46d1,16a1031881b31991f21a619112b1191fb1c41401be1f31d5,10",
        test2: "test"
      };
      return db.hashAdminPasswords(admins);
    }).then(function (_resp) {
      resp = _resp;

      resp.test.should.equal(admins.test);
      //10 is the default amount of iterations
      resp.test2.indexOf("-pbkdf2-").should.equal(0);
      resp.test2.lastIndexOf(",10").should.equal(resp.test2.length - 3);
    });
  });

  it('should support changing admin passwords hash iterations', function () {
    var resp;
    return Promise.resolve().then(function () {
      return db.hashAdminPasswords({
        abc: "test"
      }, { iterations: 11 });
    }).then(function (_resp) {
      resp = _resp;

      resp.abc.indexOf("-pbkdf2-").should.equal(0);
      resp.abc.lastIndexOf(",11").should.equal(resp.abc.length - 3);
    });
  });
});

describe('No automated test setup', function () {
  beforeEach(function () {
    db = (0, _utils.setup)();
  });
  afterEach(_utils.teardown);

  it('should support admin logins', function () {
    var opts, logInData, sessionData;
    return Promise.resolve().then(function () {
      opts = {
        admins: {
          username: '-pbkdf2-37508a1f1c5c19f38779fbe029ae99ee32988293,885e6e9e9031e391d5ef12abbb6c6aef,10'
        },
        secret: db.generateSecret()
      };
      return db.useAsAuthenticationDB(opts);
    }).then(function () {
      return db.multiUserSession();
    }).then(function (_resp) {

      shouldNotBeLoggedIn(_resp);
      return db.multiUserLogIn('username', 'test');
    }).then(function (_resp) {
      logInData = _resp;

      shouldBeSuccesfulLogIn(logInData, ['_admin']);

      db.stopUsingAsAuthenticationDB();
      return db.useAsAuthenticationDB({/* no admins */});
    }).then(function () {
      return db.multiUserSession(logInData.sessionID);
    }).then(function (_resp) {

      //if admins not supplied, there's no session (admin party!)
      shouldBeAdminParty(_resp);

      db.stopUsingAsAuthenticationDB();
      return db.useAsAuthenticationDB(opts);
    }).then(function () {
      return db.multiUserSession(logInData.sessionID);
    }).then(function (_resp) {

      //otherwise there is
      sessionData = _resp;

      shouldBeLoggedIn(sessionData, ["_admin"]);

      //check if logout works (i.e. forgetting the session id.)
      return db.multiUserSession();
    }).then(function (_resp) {
      shouldNotBeLoggedIn(_resp);
    });
  });

  it('should handle invalid admins field on login', function () {
    var admins, error;
    return Promise.resolve().then(function () {
      admins = {
        username: "-pbkdf2-37508a1f1c5c19f38779fbe029ae99ee32988293,885e6e9e9031e391d5ef12abbb6c6aef,10",
        username2: 'this-is-no-hash'
      };
      return db.useAsAuthenticationDB({ admins: admins });
    }).then(function () {
      return db.session();
    }).then(function (_resp) {

      shouldNotBeLoggedIn(_resp);
      return (0, _utils.shouldThrowError)(function () {
        return db.logIn("username2", "test");
      });
    }).then(function (_resp) {
      error = _resp;

      error.status.should.equal(401);
      return db.session();
    }).then(function (_resp) {
      shouldNotBeLoggedIn(_resp);
    });
  });

  it('should not accept timed out sessions', function () {
    var sessionID;
    return Promise.resolve().then(function () {
      return db.useAsAuthenticationDB({
        secret: '4ed13457964f05535fbb54c0e9f77a83',
        timeout: 3600,
        admins: {
          // password 'test'
          'jan': '-pbkdf2-2be978bc2be874f755d8899cfddad18ed78e3c09,d5513283df4f649c72757a91aa30bdde,10'
        }
      });
    }).then(function () {
      sessionID = 'amFuOjU2Njg4MkI5OkEK3-1SRseo6yNRHfk-mmk6zOxm';
      // example stolen from calculate-couchdb-session-id's test suite. That
      // session timed out quite a bit ago.

      return db.multiUserSession(sessionID);
    }).then(function (_resp) {
      shouldNotBeLoggedIn(_resp);
    });
  });
});
