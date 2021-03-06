/* jshint node: true */
/* global panic, getconf, component */
'use strict';


/**** Register globals *****/
require('./globals')(global);


/**** Modules *****/
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var compression = require('compression');
var bodyParser = require('body-parser');
var security = require('lusca');
var session = require('express-session');
var sockets = require('./sockets');
var logger = require('morgan');
var path = require('path');
var debug = require('debug')('app:main');
var mongoose = require('mongoose');


/**** Components ****/
var multiParser = component('multiparse');
var schemas = component('schemas');
var routes = component('routes');
var gridfs = component('gridfs');
var auth = component('auth');


/**** Configuration ****/
var configs = {
  server: getconf('server'),
  security: getconf('security'),
  database: getconf('database'),
  session: getconf('session')(session),
  routes: getconf('routes'), // Routes must be compiled later
  schemas: getconf('schemas'),
  views: getconf('views')(app),
  errors: getconf('errors'),
  static: getconf('static'),
  auth: getconf('auth')
};


/**** Setup ****/
app.set('port', process.env.PORT || configs.server.port);
app.set('views', path.join(process.cwd(), configs.views.basedir));
app.set('view engine', configs.views.engine);

if (app.get('env') === 'production') {
  app.set('trust proxy', 1); // Trust first proxy
  configs.session.cookie.secure = true; // Serve secure cookies
}


/**** Settings ****/
/* Keep this order:
 *
 * 1.- Session
 * 2.- Cookie Parser
 * 3.- Body Parser
 * 4.- Multipart Parser
 * 6.- Security [...]
 * 5.- Compression
 * 7.- Anything else...
 */
app.use(session(configs.session));
app.use(configs.session.cookieParser);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(multiParser());
app.use(security.csrf(configs.security.csrf));
app.use(security.csp(configs.security.csp));
app.use(security.xframe(configs.security.xframe));
app.use(security.p3p(configs.security.p3p));
app.use(security.hsts(configs.security.hsts));
app.use(security.xssProtection(configs.security.xssProtection));
app.use(express.static(configs.static.basedir));
app.use(compression());
app.use(logger(app.get('env') === 'production' ? 'tiny' : 'dev'));


/**** Auth ****/
auth(app, configs.auth);


/**** Routes ****/
schemas(configs.schemas.basedir); /* Register schemas */
routes(app, configs.routes.basedir); /* Compile routes */
configs.errors(app); /* Error handlers */


/**** Initialization *****/
configs.database(function (err) {

  if (err) {
    panic("Couldn't connect to the database");
  } else {
    /* Initialize GridFS component */
    gridfs.init(mongoose.connection.db, mongoose.mongo);

    http.listen(app.get('port'), function () {
      debug("Server listening on port " + app.get('port'));
      sockets(io, configs.session); /* Initialize sockets */
    });
  }

});
