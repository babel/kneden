import {
  setup,
  teardown,
  should,
  shouldThrowError
} from './utils';
import extend from 'extend';
let db;
function shouldBeAdminParty(session) {
  session.info.should.eql({
    'authentication_handlers': ['api'],
    'authentication_db': 'test'
  });
  session.userCtx.should.eql({
    'name': null,
    'roles': ['_admin']
  });
  session.ok.should.be.ok;
}
function shouldNotBeLoggedIn(session) {
  session.info.should.eql({
    authentication_handlers: ['api'],
    authentication_db: 'test'
  });
  session.userCtx.should.eql({
    name: null,
    roles: []
  });
  session.ok.should.be.ok;
}
function shouldBeSuccesfulLogIn(data, roles) {
  var copy;
  copy = extend({}, data);
  // irrelevant
  delete copy.sessionID;
  copy.should.eql({
    'ok': true,
    'name': 'username',
    'roles': roles
  });
}
function shouldBeLoggedIn(session, roles) {
  session.userCtx.should.eql({
    'name': 'username',
    'roles': roles
  });
  session.info.authenticated.should.equal('api');
}
describe('SyncAuthTests', () => {
  beforeEach(() => {
    return Promise.resolve().then(function () {
      db = setup();
      return db.useAsAuthenticationDB({ isOnlineAuthDB: false });
    }).then(function (pResp) {
      should.not.exist(pResp);
    });
  });
  afterEach(teardown);
  it('should test the daemon', () => {
  });
  it('should not allow stopping usage as an auth db twice', () => {
    return Promise.resolve().then(function () {
      return db.stopUsingAsAuthenticationDB();
    }).then(function () {
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.stopUsingAsAuthenticationDB();
        }).then(function (pResp) {
          return pResp;
        });
      });
    }).then(function () {
      return db.useAsAuthenticationDB();
    }).then(function () {
    });
  });
  it('should not allow using a db as an auth db twice', () => {
    return Promise.resolve().then(function () {
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.useAsAuthenticationDB();
        }).then(function (pResp) {
          return pResp;
        });
      });
    }).then(function () {
    });
  });
  it('should have working db methods', () => {
    var signUpData, doc, session, logInData, session2, session3, logOutData, session4, logOutData2, error;
    return Promise.resolve().then(function () {
      return db.signUp('username', 'password', { roles: ['test'] });
    }).then(function (pResp) {
      signUpData = pResp;
      signUpData.rev.indexOf('1-').should.equal(0);
      signUpData.ok.should.be.ok;
      signUpData.id.should.equal('org.couchdb.user:username');
      return db.get('org.couchdb.user:username');
    }).then(function (pResp) {
      doc = pResp;
      doc._rev.indexOf('1-').should.equal(0);
      doc.should.have.property('derived_key');
      doc.iterations.should.equal(10);
      doc.name.should.equal('username');
      doc.password_scheme.should.equal('pbkdf2');
      doc.roles.should.eql(['test']);
      doc.should.have.property('salt');
      doc.type.should.equal('user');
      doc.should.not.have.property('password');
      return db.session();
    }).then(function (pResp) {
      session = pResp;
      shouldBeAdminParty(session);
      return db.logIn('username', 'password');
    }).then(function (pResp) {
      logInData = pResp;
      shouldBeSuccesfulLogIn(logInData, ['test']);
      return db.session();
    }).then(function (pResp) {
      session2 = pResp;
      shouldBeLoggedIn(session2, ['test']);
      return db.multiUserSession();
    }).then(function (pResp) {
      session3 = pResp;
      shouldBeAdminParty(session3);
      return db.logOut();
    }).then(function (pResp) {
      logOutData = pResp;
      logOutData.ok.should.be.ok;
      return db.session();
    }).then(function (pResp) {
      session4 = pResp;
      shouldBeAdminParty(session4);
      return db.logOut();
    }).then(function (pResp) {
      logOutData2 = pResp;
      logOutData2.ok.should.be.ok;
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.logIn('username', 'wrongPassword');
        }).then(function (pResp) {
          return pResp;
        });
      });
    }).then(function (pResp) {
      error = pResp;
      error.status.should.equal(401);
      error.name.should.equal('unauthorized');
      error.message.should.equal('Name or password is incorrect.');
    });
  });
  it('should support sign up without roles', () => {
    var result, resp2;
    return Promise.resolve().then(function () {
      return db.signUp('username', 'password');
    }).then(function (pResp) {
      result = pResp;
      result.ok.should.be.ok;
      return db.get('org.couchdb.user:username');
    }).then(function (pResp) {
      resp2 = pResp;
      resp2.roles.should.eql([]);
    });
  });
  it('should validate docs', () => {
    var error, resp;
    return Promise.resolve().then(function () {
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.post({});
        }).then(function (pResp) {
          return pResp;
        });
      });
    }).then(function (pResp) {
      error = pResp;
      error.status.should.equal(403);
      return db.bulkDocs([{}]);
    }).then(function (pResp) {
      resp = pResp;
      resp[0].status.should.equal(403);
    });
  });
  it('should handle conflicting logins', () => {
    var doc1, doc2, error;
    return Promise.resolve().then(function () {
      doc1 = {
        _id: 'org.couchdb.user:test',
        _rev: '1-blabla',
        type: 'user',
        name: 'test',
        roles: []
      };
      doc2 = extend({}, doc1);
      doc2._rev = '2-something';
      return db.bulkDocs([
        doc1,
        doc2
      ], { new_edits: false });
    }).then(function () {
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.logIn('test', 'unimportant');
        }).then(function (pResp) {
          return pResp;
        });
      });
    }).then(function (pResp) {
      error = pResp;
      error.status.should.equal(401);
      error.name.should.equal('unauthorized');
      error.message.should.contain('conflict');
    });
  });
  it('should not accept invalid session ids', () => {
    var err;
    return Promise.resolve().then(function () {
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.multiUserSession('invalid-session-id');
        }).then(function () {
        });
      });
    }).then(function (pResp) {
      err = pResp;
      err.status.should.equal(400);
      err.name.should.equal('bad_request');
      err.message.should.contain('Malformed');
    });
  });
  afterEach(() => {
    return Promise.resolve().then(function () {
      return db.stopUsingAsAuthenticationDB();
    }).then(function (pResp) {
      should.not.exist(pResp);
    });
  });
});
describe('AsyncAuthTests', () => {
  beforeEach(() => {
    return Promise.resolve().then(function () {
      db = setup();
    });
  });
  afterEach(teardown);
  it('should suport the basics', done => {
    function cb(err) {
      db.stopUsingAsAuthenticationDB();
      done(err);
    }
    db.useAsAuthenticationDB(cb);
  });
});
describe('AsyncAuthTestsWithoutDaemon', () => {
  beforeEach(() => {
    return Promise.resolve().then(function () {
      db = setup();
    });
  });
  afterEach(teardown);
  it('should be impossible to use the various exposed methods', () => {
    should.not.exist(db.signUp);
    should.not.exist(db.session);
    should.not.exist(db.logIn);
    should.not.exist(db.logOut);
  });
  it('should hash admin passwords', () => {
    var admins, resp;
    return Promise.resolve().then(function () {
      admins = {
        test: '-pbkdf2-0abe2dcd23e0b6efc39004749e8d242ddefe46d1,16a1031881b31991f21a619112b1191fb1c41401be1f31d5,10',
        test2: 'test'
      };
      return db.hashAdminPasswords(admins);
    }).then(function (pResp) {
      resp = pResp;
      resp.test.should.equal(admins.test);
      //10 is the default amount of iterations
      resp.test2.indexOf('-pbkdf2-').should.equal(0);
      resp.test2.lastIndexOf(',10').should.equal(resp.test2.length - 3);
    });
  });
  it('should support changing admin passwords hash iterations', () => {
    var resp;
    return Promise.resolve().then(function () {
      return db.hashAdminPasswords({ abc: 'test' }, { iterations: 11 });
    }).then(function (pResp) {
      resp = pResp;
      resp.abc.indexOf('-pbkdf2-').should.equal(0);
      resp.abc.lastIndexOf(',11').should.equal(resp.abc.length - 3);
    });
  });
});
describe('No automated test setup', () => {
  beforeEach(() => {
    db = setup();
  });
  afterEach(teardown);
  it('should support admin logins', () => {
    var opts, logInData, sessionData;
    return Promise.resolve().then(function () {
      opts = {
        admins: { username: '-pbkdf2-37508a1f1c5c19f38779fbe029ae99ee32988293,885e6e9e9031e391d5ef12abbb6c6aef,10' },
        secret: db.generateSecret()
      };
      return db.useAsAuthenticationDB(opts);
    }).then(function () {
      return db.multiUserSession();
    }).then(function (pResp) {
      shouldNotBeLoggedIn(pResp);
      return db.multiUserLogIn('username', 'test');
    }).then(function (pResp) {
      logInData = pResp;
      shouldBeSuccesfulLogIn(logInData, ['_admin']);
      db.stopUsingAsAuthenticationDB();
      return db.useAsAuthenticationDB({});
    }).then(function () {
      return db.multiUserSession(logInData.sessionID);
    }).then(function (pResp) {
      //if admins not supplied, there's no session (admin party!)
      shouldBeAdminParty(pResp);
      db.stopUsingAsAuthenticationDB();
      return db.useAsAuthenticationDB(opts);
    }).then(function () {
      return db.multiUserSession(logInData.sessionID);
    }).then(function (pResp) {
      sessionData = pResp;
      shouldBeLoggedIn(sessionData, ['_admin']);
      return db.multiUserSession();
    }).then(function (pResp) {
      //check if logout works (i.e. forgetting the session id.)
      shouldNotBeLoggedIn(pResp);
    });
  });
  it('should handle invalid admins field on login', () => {
    var admins, error;
    return Promise.resolve().then(function () {
      admins = {
        username: '-pbkdf2-37508a1f1c5c19f38779fbe029ae99ee32988293,885e6e9e9031e391d5ef12abbb6c6aef,10',
        username2: 'this-is-no-hash'
      };
      return db.useAsAuthenticationDB({ admins: admins });
    }).then(function () {
      return db.session();
    }).then(function (pResp) {
      shouldNotBeLoggedIn(pResp);
      return shouldThrowError(() => {
        return Promise.resolve().then(function () {
          return db.logIn('username2', 'test');
        }).then(function (pResp) {
          return pResp;
        });
      });
    }).then(function (pResp) {
      error = pResp;
      error.status.should.equal(401);
      return db.session();
    }).then(function (pResp) {
      shouldNotBeLoggedIn(pResp);
    });
  });
  it('should not accept timed out sessions', () => {
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
      return db.multiUserSession(sessionID);
    }).then(function (pResp) {
      shouldNotBeLoggedIn(pResp);
    });
  });
});
