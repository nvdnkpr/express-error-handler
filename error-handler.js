/**
 * express-error-handler
 * 
 * A graceful error handler for Express
 * applications.
 *
 * Copyright (C) 2013 Eric Elliott
 * 
 * Written for
 * "Programming JavaScript Applications"
 * (O'Reilly)
 *
 * MIT License
 **/

'use strict';

var mixIn = require('mout/object/mixIn'),
  path = require('path'),
  fs = require('fs'),

  /**
   * Return true if the error status represents
   * a client error that should not trigger a
   * restart.
   * 
   * @param  {number} status
   * @return {boolean}
   */
  clientError = function clientError(status) {
    return (status >= 400 && status <= 499);
  },

  /**
   * Attempt a graceful shutdown, and then time
   * out if the connections fail to drain in time.
   * 
   * @param  {object} o options
   * @param  {object} o.server server object
   * @param  {object} o.timeout timeout in ms
   * @param  {function} exit - force kill function
   */
  close = function close(o, exit) {
    // We need to kill the server process so
    // the app can repair itself. Your process 
    // should be monitored in production and
    // restarted when it shuts down.
    // 
    // That can be accomplished with modules
    // like forever, forky, etc...
    // 
    // First, try a graceful shutdown:
    if (o.server && typeof o.server.close ===
        'function') {
      o.server.close(function () {
        process.exit(o.exitStatus);
      });
    }

    // Just in case the server.close() callback
    // never fires, this will wait for a timeout
    // and then terminate. Users can override
    // this function by passing options.shutdown:
    exit(o);
  },

  sendFile = function sendFile (staticFile, res) {
    var filePath = path.resolve(staticFile),
      stream = fs.createReadStream(filePath);
    stream.pipe(res);
  },

  defaults = {
    handlers: {},
    views: {},
    static: {},
    timeout: 3 * 1000,
    exitStatus: 1,
    server: undefined,
    shutdown: undefined
  },
  createHandler;

/**
 * A graceful error handler for Express
 * applications.
 * 
 * @param {object} [options]
 * 
 * @param {object} [options.handlers] Custom
 *        handlers for specific status codes.
 *
 * @param {object} [options.views] View files to 
 *        render in response to specific status 
 *        codes. Specify a default with
 *        options.views.default.
 *
 * @param {object} [options.static] Static files 
 *        to send in response to specific status 
 *        codes. Specify a default with
 *        options.static.default.
 *
 * @param {number} [options.timeout] Delay 
 *        between the graceful shutdown
 *        attempt and the forced shutdown
 *        timeout.
 *
 * @param {number} [options.exitStatus] Custom 
 *        process exit status code.
 *
 * @param {object} [options.server] The app server
 *        object for graceful shutdowns.
 *
 * @param {function} [options.shutdown] An
 *        alternative shutdown function if the
 *        graceful shutdown fails.
 *
 * @return {function} errorHandler Express error 
 *         handling middleware.
 */
createHandler = function createHandler(options) {

  var o = mixIn({}, defaults, options),

    /**
     * In case of an error, wait for a timer to
     * elapse, and then terminate.
     * @param {object} options
     * @param {number} o.exitStatus
     * @param {number} o.timeout
     */
    exit = o.shutdown || function exit(o){

      // Give the app time for graceful shutdown.
      setTimeout(function () {
        process.exit(o.exitStatus);
      }, o.timeout);

    };

  /**
   * Express error handler to handle any
   * uncaught express errors. For error logging,
   * see bunyan-request-logger.
   * 
   * @param  {object}   err 
   * @param  {object}   req
   * @param  {object}   res
   * @param  {function} next
   */
  return function errorHandler(err, req,
      res, next) {

    var defaultView = o.views['default'],
      defaultStatic = o.static['default'],
      status = err.status,
      handler = o.handlers[status],
      view = o.views[status],
      staticFile = o.static[status],

      renderDefault = function
          renderDefault(status) {
        if (defaultView) {
          return res.render(defaultView, err);
        }

        if (defaultStatic) {
          return sendFile(defaultStatic, res);
        }

        return res.send(status);
      },

      resumeOrClose = function
          resumeOrClose(status) {
        if (!clientError(status)) {
          return close(o, exit);
        }
      };


    // If there's a custom handler defined,
    // use it and return.
    if (typeof handler === 'function') {
      handler(err, req, res, next);
      return resumeOrClose(status);
    }

    // If there's a custom view defined,
    // render it.
    if (view) {
      res.render(view, err);
      return resumeOrClose(status);
    }

    // If there's a custom static file defined,
    // render it.
    if (staticFile) {
      sendFile(staticFile, res);
      return resumeOrClose(status);
    }

    // If the error is user generated, send
    // a helpful error message, and don't shut
    // down.
    // 
    // If we shutdown on user errors,
    // attackers can send malformed requests
    // for the purpose of creating a Denial 
    // Of Service (DOS) attack.
    if (clientError(status)) {
      return renderDefault(status);
    }

    // For all other errors, deliver a 500
    // error and shut down.
    renderDefault(500);

    close(o, exit);
  };
};


createHandler.clientError = clientError;

module.exports = createHandler;
