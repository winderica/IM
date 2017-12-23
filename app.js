var crypto = require('crypto');
var base64Img = require('base64-img');
var app = require('express')();
var expressWs = require('express-ws')(app);
var wsApp = expressWs.app;
var webSockets = {};
var webSocketsMessage = {};
var bodyParser = require('body-parser');
var jwt = require('jwt-simple');
var insert = require('./db/database').insertData;
var find = require('./db/database').findData;
var update = require('./db/database').updateData;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extend: false }));

app.post('/image', function (req, res) {
    console.log('connected to /image');
    var img = req.image;
    var t = Date.now();
    base64Img.img(img, 'image', t);
    res.type('application/json').send(JSON.stringify({ id: t }));
});
app.post('/user/login', function (req, res) {
    console.log('connected to /user/login');
    var msg = req.body;
    var username = msg.username,
        password = msg.password;
    password = crypto.createHash('md5').update(password).digest('hex');
    var obj = {
        username: username
    };
    find('user', obj, function (t) {
        if (!t) {
            console.log('username is not correct');
            res.status(400).type('application/json').send(JSON.stringify({ name:'username', error:'username is not correct' }));
        } else if (t[0].password_hash === password) {
            console.log('login: ', { username:username, password_hash:password });
            res.status(200).type('application/json').send(JSON.stringify({jwt:jwt.encode({ username:username, password_hash:password }, 'secret')}));
        } else {
            console.log('password is not correct');
            res.status(400).type('application/json').send(JSON.stringify({ name:'password', error:'password is not correct' }));
        }
    });
});
app.post('/user/register', function (req, res) {
    console.log('connected to /user/register');
    var msg = req.body;
    var username = msg.username,
        password = msg.password;
    var obj = {
        username: username,
        password_hash: crypto.createHash('md5').update(password).digest('hex')
    };
    find('user', {username: username}, function (t) {
        if (t[0]) {
            console.log('this username has already been registered');
            res.status(400).type('application/json').send(JSON.stringify({ name:'username', error:'this username has already been registered' }));
        } else {
            console.log('register: ', obj);
            insert('user', obj);
            res.status(201).type('application/json').send(JSON.stringify({ jwt: jwt.encode(obj, 'secret') }));
        }
    });
});
app.get('/user', function (req, res) {
    var decoded = jwt.decode(req.headers.authorization, "secret");
    console.log(decoded);

    console.log('connected to /user/:username');
    find('user', {username: decoded.username}, function (s) {
        if (s.password_hash === decoded.password_hash) {
            console.log('find user: ', s[0]);
            res.status(200).type('application/json').send(JSON.stringify(s[0]));
        } else {
            res.status(400).type('application/json').send(JSON.stringify({name: 'jwt', error: 'jwt isn\'t correct'}))
        }
    });
});
app.patch('/user', function (req, res) {
    var decoded = jwt.decode(req.headers.authorization, "secret");
    console.log(decoded);

    console.log('patch to /user/:username');
    find('user', {username: decoded.username}, function (s) {
        if (s.password_hash === decoded.password_hash) {
            var newData = req.body;
            var avatar = newData.avatar,
                oldPassword = newData.self_password,
                newPassword = newData.password,
                username = decoded.username;
            if (oldPassword && newPassword) {
                var oldHash = crypto.createHash('md5').update(oldPassword).digest('hex'),
                    newHash = crypto.createHash('md5').update(newPassword).digest('hex');
                if (oldHash === newHash) {
                    console.log('same password');
                    res.status(400).type('application/json').send(JSON.stringify({
                        name: 'password',
                        error: 'new password should not be same as former'
                    }));
                } else if (oldHash === s[0].password_hash) {
                    console.log('update info');
                    update('user', req.params, {password_hash: newHash});
                    res.status(200).type('application/json').send(JSON.stringify({
                        username: username,
                        password: newPassword
                    }));
                } else {
                    console.log('old password is not correct');
                    res.status(400).type('application/json').send(JSON.stringify({
                        name: 'self_password',
                        error: 'old password is not correct'
                    }));
                }
            }
            if (avatar) {
                base64Img.img(avatar, 'image', Date.now(), function (err, path) {
                    if (err) throw err;
                    update('user', req.params, {avatar: path});
                })
            }
        } else {
            res.status(400).type('application/json').send(JSON.stringify({name: 'jwt', error: 'jwt isn\'t correct'}))
        }
    });
});
app.get('/user/friends', function (req, res) {
    var decoded = jwt.decode(req.headers.authorization, "secret");
    console.log(decoded);
    var username = decoded.username;

    var friends = [];
    find('user_relationship', {username_a: username}, function (s) {
        for (var i = 0; i < s.length; i++) {
            if (s[i].status) {
                find('user', {username: s.username_b}, function (t) {
                    t = t[0];
                    if (t.avatar) {
                        base64Img.base64(t.avatar, function (err, data) {
                            if (err) throw err;
                            friends.push({ username: s.username_b, avatar: data });
                        })
                    } else {
                        friends.push({ username: s.username_b });
                    }
                })
            }
        }
    });
    find('user_relationship', {username_b: username}, function (s) {
        for (var i = 0; i < s.length; i++) {
            if (s[i].status) {
                find('user', {username: s.username_a}, function (t) {
                    t = t[0];
                    if (t.avatar) {
                        base64Img.base64(t.avatar, function (err, data) {
                            if (err) throw err;
                            friends.push({ username: s.username_a, avatar: data });
                        })
                    } else {
                        friends.push({ username: s.username_a });
                    }
                })
            }
        }
    });
    res.type('application/json').send(JSON.stringify(friends));
});

wsApp.use('/user/friends/request', function (req, res, next) {
    console.log('connected to /user/friends/request');
    return next();
});
var jwtFriend;
wsApp.post('/user/friends/request', function (req, res, next) {
    console.log('get post');
    jwtFriend = req.body.jwt;
    console.log(jwtFriend);
    res.type('application/json').send(JSON.stringify({info: 'received'}));
    next();
});
wsApp.ws('/user/friends/request', function (webSocket) {
    console.log(jwtFriend);
    console.log('websocket connected');
    var decoded = jwt.decode(jwtFriend, "secret");
    console.log(decoded);
    var uid = decoded.username;
    webSockets[uid] = webSocket;
    console.log('connected :' + uid + ' in ' + Object.getOwnPropertyNames(webSockets));
    webSocket.on('message', function (msg) {
        console.log('received from ' + uid + ': ' + msg);
        msg = JSON.parse(msg);
        if (msg.type === 'history') {
            var requests = [];
            find('user_relationship', {username_a: uid}, function (s) {
                for (var i = 0; i < s.length; i++) {
                    if (s[i].status) {
                        find('user', {username: s.username_b}, function (t) {
                            t = t[0];
                            if (t.avatar) {
                                base64Img.base64(t.avatar, function (err, data) {
                                    if (err) throw err;
                                    requests.push({ id:s.id, username: s.username_b, avatar: data });
                                })
                            } else {
                                requests.push({ id:s.id, username: s.username_b });
                            }
                        })
                    }
                }
            });
            find('user_relationship', {username_b: uid}, function (s) {
                for (var i = 0; i < s.length; i++) {
                    if (s[i].status) {
                        find('user', {username: s.username_a}, function (t) {
                            t = t[0];
                            if (t.avatar) {
                                base64Img.base64(t.avatar, function (err, data) {
                                    if (err) throw err;
                                    requests.push({ id:s.id, username: s.username_a, avatar: data });
                                })
                            } else {
                                requests.push({ id:s.id, username: s.username_a });
                            }
                        })
                    }
                }
            });
            webSocket.send(JSON.stringify(requests));
        } else if (msg.type === 'send_request') {
            console.log(msg);
            find("user", {username: msg.username}, function (s) {
                if (s) {

                    var to = webSockets[msg.username];
                    insert("user_relationship", {id: Date.now(), username_a: uid, username_b: msg.username});
                    console.log("inserted " + {id: Date.now(), username_a: uid, username_b: msg.username});
                    if (to) {
                        console.log('sent to ' + msg.username + ': ' + JSON.stringify(msg));
                        webSocket.send(JSON.stringify({info:'received'}));
                        find("user", {username: uid}, function (t) {
                            t = t[0];
                            if (t.avatar) {
                                base64Img.base64(t.avatar, function (err, data) {
                                    if (err) throw err;
                                    to.send(JSON.stringify({type: 'receive_request', username: uid, avatar: data}));
                                })
                            } else {
                                to.send(JSON.stringify({type: 'receive_request', username: uid}));
                            }
                        });
                    }
                } else {
                    webSocket.send(JSON.stringify({name: 'username', error: 'username doesn\'t exist'}));
                }
            })
        } else if (msg.type === 'reject_request') {
            if (msg.id) {
                update("user_relationship", {id: msg.id}, {status: false});
                webSocket.send(JSON.stringify({ info:'rejected' }));
            }
            if (msg.username) {
                find("user_relationship", { username_a: msg.username, username_b: uid }, function (t) {
                    if (t) {
                        update("user_relationship", { username_a: msg.username, username_b: uid }, {status: false});
                    } else {
                        update("user_relationship", { username_b: msg.username, username_a: uid }, {status: false});
                    }
                });
                webSocket.send(JSON.stringify({ info:'deleted' }));
            }
        } else if (msg.type === 'agree_request') {
            if (msg.id) {
                update("user_relationship", {id: msg.id}, {status: true});
                webSocket.send(JSON.stringify({info:'accepted'}));
            }
        } else {
            webSocket.send(JSON.stringify({info:'type error'}));
        }
    })
});

wsApp.use('/message', function (req, res, next) {
    console.log('connected to /message');
    return next();
});
var jwtMessage;
wsApp.post('/message', function (req, res, next) {
    console.log('get post');
    jwtMessage = req.body.jwt;
    console.log(jwtMessage);
    res.type('application/json').send(JSON.stringify({info: 'received'}));
    next();
});

wsApp.ws('/message', function (webSocket) {
    console.log('websocket connected');
    var decoded = jwt.decode(jwtMessage, "secret");
    console.log(decoded);
    var uid = decoded.username;
    webSocketsMessage[uid] = webSocket;
    console.log('connected :' + uid + ' in ' + Object.getOwnPropertyNames(webSocketsMessage));
    webSocket.on('message', function (msg) {
        console.log('received from ' + uid + ': ' + msg);
        msg = JSON.parse(msg);
        if (msg.type === 'history') {
            var start = msg.start_time;
            var end = msg.end_time;
            var messages = [];
            find('message', {to: uid}, function (s) {
                for (var i = 0; i < s.length; i++) {
                    if (s[i].create_time > start && s[i].create_time < end) {
                        messages.push(s[i]);
                    }
                }
            });
            webSocket.send(JSON.stringify(messages));
        } else if (msg.type === 'send_message') {
            var to = webSockets[msg.to];
            webSocket.send(JSON.stringify({info:'received'}));
            insert("message", {create_time: msg.create_time, from: uid, to: msg.to, content: msg.content});
            if (to) {
                console.log('sent to ' + msg.to + ': ' + JSON.stringify(msg));
                to.send(JSON.stringify({type: 'receive_message', create_time: msg.create_time, from: uid, to: msg.to, content: msg.content}));
            }
        } else {
            webSocket.send(JSON.stringify({error:'type error'}));
        }
    })
});

app.listen(7341);

