SlickBonobo = require('SlickBonobo').SlickBonobo;
assert = require('assert');

module.exports = {
    'test new': function() {
        assert.isNotNull(new SlickBonobo);
    }
};
