var SlickBonobo = require('../lib/SlickBonobo').SlickBonobo
  , assert = require('assert')
  , should = require('should')
;
//  , http   = require('http');


describe('SlickBonobo', function() {
    it('should construct', function() {
        assert(new SlickBonobo);
    });
});

describe('SlickBonobo.UserScript', function() {
    function testUserScript(args) {
        return new SlickBonobo.UserScript({
            path: 'test/test.user.js',
            include: ['http://broquaint.com/']
        });
    }
    describe('new', function() {
        it('should construct', function() {
            var us = testUserScript();
            us.should.have.property('source');
        });
        it('should fail for non-existant scripts', function() {
            (function() {
                new SlickBonobo.UserScript({
                    path: 'test/not-even-a-thing.user.js'
                });
            }).should.throw();
        });
    });

    describe('shouldRunOn', function() { 
       it('should match exact string', function() { 
           assert(
               testUserScript().shouldRunOn(
                   'http://broquaint.com/'
               )
           );
           assert(
               !testUserScript().shouldRunOn(
                   'failfailfail'
               )
           );
       });
    });
});

describe('SlickBonobo.PageMunger', function() { 
    function testPageMunger () {
        return new SlickBonobo.PageMunger({
            config_path: 'test/test-config.json'
        });
    }

    describe ('new', function() { 
        it('should construct', function() { 
            var pm = testPageMunger();
            // XXX Less hard coding?
            pm.should.eql({
                userScripts: [
                    new SlickBonobo.UserScript({
                        name:    "Test Script",
                        version: "0.1",
                        include: ["http://broquaint.com/"],
                        enabled: true,
                        path:    "test/test.user.js",
                        source:  "randomState = 'frobbed';"
                    })
                ]
            });
        });
    });

    describe ('runScriptsOn', function() { 
        it ('should run the test script', function() { 
            var pm = testPageMunger(),
                window = pm.runScriptsOn(
                { requestUrl: "http://broquaint.com/" },
                {}
            );
            window.should.have.property('randomState');
            window.randomState.should.equal('frobbed');
        });
    });
});
