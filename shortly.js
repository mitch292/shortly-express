var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(session({ secret: 'keyboard cat', cookie: { maxAge: 60000 }}));

const checkUser = function(req, res, next) {
  if (req.session.user) {
    console.log('session id exists', req.session.user)
    next();
  } else {
    console.log('this user is not authenticated', req.session)
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

app.get('/', checkUser, 
function(req, res) {
  res.render('index');
});

app.get('/create', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links', checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});
app.get('/login',
function(req, res) {
  res.render('login');
});
app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.get('/logout', checkUser,
function(req, res) {
  console.log('before destruction', req.session.user);
  req.session.destroy();
  console.log('session post destruction', req.session);
  res.redirect('index');
});

app.post('/links', checkUser,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.post('/signup',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  new User({username: username}).fetch().then(function(found) {
    if (found) {
      // var elem = document.getElementById('bad-name');
      // elem.style.display = visible;
      console.error('This username exists already, choose another!');
      res.redirect('signup');
    } else {
      bcrypt.hash(password, null, null, function(err, hash) {
        Users.create({ username: username, password: hash }).then(function() {
          req.session.regenerate(function() {
            req.session.user = username;
            console.log('the user is authenticated', req.session.user);
            res.redirect('/');
            res.status(201).send(); 
          });
    
        });
      });
    }
  })
});

app.post('/login',
function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  
  new User({username: username}).fetch().then(function(found) {
    console.log('what does the return from the db look like', found)
    if (found) {
      bcrypt.compare(password, found.attributes.password, function(err, result) {
        if (result === false) {
          console.log('Incorrect Password');
          res.redirect('login')
        } else {
          console.log('AUTHENTICATION NEEDED');
          req.session.regenerate(function() {
            req.session.user = username;
            console.log('the user is authenticated', req.session.user);
            res.redirect('/');
          }); 
        }
      // console.log('AUTHENTICATION NEEDED');
      // req.session.regenerate(function() {
      //   req.session.user = username;
      //   console.log('the user is authenticated', req.session.user);
      //   res.redirect('/');
      });
    } else {
      console.error('BAD LOGIN');
      res.redirect(301, '/login')
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
