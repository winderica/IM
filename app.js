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
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});


app.post('/image', function (req, res) {
    console.log('connected to /image');
    var img = req.image;
    var t = Date.now();
    base64Img.img(img, 'image', t);
    res.type('application/json').send(JSON.stringify({id: t}));
});
app.post('/user/login', function (req, res) {
    console.log('connected to /user/login');
    var msg = req.body;
    console.log(req.body);
    var username = msg.username,
        password = msg.password;
    password = crypto.createHash('md5').update(password).digest('hex');
    var obj = {
        username: username
    };
    find('user', obj, function (t) {
        if (!t[0]) {
            console.log('username is not correct');
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'username',
                error: 'username is not correct'
            }));
        } else if (t[0].password_hash === password) {
            console.log('login: ', {username: username, password_hash: password});
            res.status(200).type('application/json').send(JSON.stringify({
                jwt: jwt.encode({
                    username: username,
                    password_hash: password
                }, 'secret')
            }));
        } else {
            console.log('password is not correct');
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'password',
                error: 'password is not correct'
            }));
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
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'username',
                error: 'this username has already been registered'
            }));
        } else {
            console.log('register: ', obj);
            insert('user', obj);
            res.status(201).type('application/json').send(JSON.stringify({jwt: jwt.encode(obj, 'secret')}));
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
                    update('user', req.params, {$set: {password_hash: newHash}});
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
                    update('user', req.params, {$set: {avatar: path}});
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
    find('user_relationship', {$or: [{username_a: username}, {username_b: username}]}, function (s) {
        for (var i = 0; i < s.length; i++) {
            if (s[i].status) {
                if (s[i].username_a === username) {
                    friends.push({username: s[i].username_b});
                } else {
                    friends.push({username: s[i].username_a});
                }
                console.log(friends);
            }
        }
        res.type('application/json').send(JSON.stringify(friends));
    });
});

wsApp.use('/user/friends/request', function (req, res, next) {
    console.log('connected to /user/friends/request');
    next();
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
            find('user_relationship', {username_b: uid}, function (s) {
                for (var i = 0; i < s.length; i++) {
                    if (!s[i].hasOwnProperty('status')) {
                        requests.push({id:s[i].id, username: s[i].username_a});
                        console.log(requests);
                    }
                }
                webSocket.send(JSON.stringify({type: 'history', requests: requests}));
            });
        } else if (msg.type === 'send_request') {
            console.log(msg);
            find("user", {username: msg.username}, function (s) {
                if (s) {
                    var to = webSockets[msg.username];
                    var id = Date.now();
                    insert("user_relationship", {id: id, username_a: uid, username_b: msg.username});
                    console.log("inserted " + JSON.stringify({id: id, username_a: uid, username_b: msg.username}));
                    if (to) {
                        console.log('sent to ' + msg.username + ': ' + JSON.stringify(msg));
                        webSocket.send(JSON.stringify({type:'send_request', info: 'received'}));
                        find("user", {username: uid}, function (t) {
                            t = t[0];
                            if (t.avatar) {
                                base64Img.base64(t.avatar, function (err, data) {
                                    if (err) throw err;
                                    to.send(JSON.stringify({
                                        id: id,
                                        type: 'receive_request',
                                        username: uid,
                                        avatar: data
                                    }));
                                })
                            } else {
                                to.send(JSON.stringify({id: id, type: 'receive_request', username: uid}));
                            }
                        });
                    }
                } else {
                    webSocket.send(JSON.stringify({type:'send_request', name: 'username', error: 'username doesn\'t exist'}));
                }
            })
        } else if (msg.type === 'reject_request') {
            if (msg.id) {
                update("user_relationship", {id: msg.id}, {$set: {status: false}});
                webSocket.send(JSON.stringify({type:'reject_request', info: 'rejected'}));
            }
            if (msg.username) {
                find("user_relationship", {username_a: msg.username, username_b: uid}, function (t) {
                    if (t) {
                        update("user_relationship", {
                            username_a: msg.username,
                            username_b: uid
                        }, {$set: {status: false}});
                    } else {
                        update("user_relationship", {
                            username_b: msg.username,
                            username_a: uid
                        }, {$set: {status: false}});
                    }
                });
                webSocket.send(JSON.stringify({type:'reject_request', info: 'deleted'}));
            }
        } else if (msg.type === 'agree_request') {
            if (msg.id) {
                update("user_relationship", {id: msg.id}, {$set: {status: true}});
                webSocket.send(JSON.stringify({type:'agree_request', info: 'accepted'}));
            }
        } else {
            webSocket.send(JSON.stringify({info: 'type error'}));
        }
    });
    webSocket.on('close', function () {
        delete webSockets[uid];
        console.log('deleted: ' + uid);
    })
});

wsApp.use('/message', function (req, res, next) {
    console.log('connected to /message');
    next();
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
            find('message', {$or: [{from: uid}, {to: uid}]}, function (s) {
                for (var i = 0; i < s.length; i++) {
                    if (s[i].create_time >= start && s[i].create_time <= end) {
                        messages.push({create_time: s[i].create_time, from: s[i].from, to: s[i].to, content: s[i].content});
                    }
                }
                webSocket.send(JSON.stringify({type:'history', messages: messages}));
            });
        } else if (msg.type === 'send_message') {
            var to = webSockets[msg.to];
            webSocket.send(JSON.stringify({type:'send_message', info: 'received'}));
            insert("message", {create_time: msg.create_time, from: uid, to: msg.to, content: msg.content});
            if (to) {
                console.log('sent to ' + msg.to + ': ' + JSON.stringify(msg));
                to.send(JSON.stringify({
                    type: 'receive_message',
                    create_time: msg.create_time,
                    from: uid,
                    to: msg.to,
                    content: msg.content
                }));
            }
        } else {
            webSocket.send(JSON.stringify({type:'send_message', error: 'type error'}));
        }
    });
    webSocket.on('close', function () {
        delete webSocketsMessage[uid];
        console.log('deleted: ' + uid);
    })

});

app.listen(7341);