/*!
 * slick-bonobo
 * Copyright(c) 2014 Dan Brook <dan@broquaint.com>
 * MIT Licensed
 */

var convict = require('convict');

var context = module.exports = convict({
  env: {
    doc: "The applicaton environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV",
    arg: "node-env"
  },
  config_path: {
    doc: "The applicaton environment.",
    format: String,
    // default: "development",
    env: "CONFIG_PATH",
    arg: "config-path"
  },
  sb_port: {
    doc: "The SlickBonobo port to bind.",
    format: "port",
    default: 8080,
    env: "SB_PORT",
    arg: 'sb-port'
  },
  tnh_port: {
    doc: "The TratznHeck port to bind.",
    format: "port",
    default: 3000,
    env: "TNH_PORT",
    arg: 'tnh-port'
  },
  allowedIPs: {
      doc: "A list of IPs that are allowed to access the proxy",
      format: Array, // of IPs
      default: []
  },
  PagerMunger: {
      userScripts: {
          doc: "A list of user script configs",
          // TODO Custom validator
          format: Array, // Of { name: String, version: String, include: Array, enabled: Boolean, path: String }
          default: []
      }
  }
});

context.loadAndValidateFile = function(path) {
    var config = this.loadFile(path),
        allowedIPs;

    config.validate();

    // if(!config.has('PageMunger.userScripts'))
    //     throw 'No PageMunger.userScripts found in: ' + path;

    allowedIPs = config.get('allowedIPs');
    if(allowedIPs.length === 0) {
        // TODO Make this a validator
        throw 'No IPs defined!';
    }

    return config;
};
