const crypto = require('crypto');
const base64Img = require('base64-img');
const app = require('express')();
const expressWs1 = require('express-ws')(app);
const expressWs2 = require('express-ws')(app);
const friendWs = expressWs1.app;
const messageWs = expressWs2.app;
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const insert = require('./db/database').insertData;
const find = require('./db/database').findData;
const update = require('./db/database').updateData;

let webSockets = {};
let webSocketsMessage = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extend: false }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.post('/user/login', (req, res) => {
    console.log('connected to /user/login');
    const msg = req.body;
    console.log(req.body);
    let username = msg.username,
        password = msg.password;
    password = crypto.createHash('md5').update(password).digest('hex');
    const obj = {
        username: username
    };
    find('user', obj, t => {
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
app.post('/user/register', (req, res) => {
    console.log('connected to /user/register');
    const msg = req.body;
    const username = msg.username,
        password = msg.password;
    const obj = {
        username: username,
        password_hash: crypto.createHash('md5').update(password).digest('hex')
    };
    find('user', {username: username}, t => {
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
app.get('/user', (req, res) => {
    const decoded = jwt.decode(req.headers.authorization, "secret");
    console.log('received jwt');

    console.log('connected to /user/:username');
    find('user', {username: decoded.username}, s => {
        if (s[0].password_hash === decoded.password_hash) {
            console.log('find user: ', s[0].username);
            if (s[0].hasOwnProperty('avatar')) {
                base64Img.base64(s[0].avatar, (err, data) => {
                    if (err) throw err;
                    res.status(200).type('application/json').send(JSON.stringify({username: s[0].username, password_hash: s[0].password_hash, avatar: data}));
                });
            } else {
                res.status(200).type('application/json').send(JSON.stringify({username: s[0].username, password_hash: s[0].password_hash}));
            }
        } else {
            res.status(400).type('application/json').send(JSON.stringify({name: 'jwt', error: 'jwt isn\'t correct'}))
        }
    });
});
app.patch('/user', (req, res) => {
    const decoded = jwt.decode(req.headers.authorization, "secret");
    console.log('received jwt');

    console.log('patch to /user/:username');
    find('user', {username: decoded.username}, s => {
        if (s[0].password_hash === decoded.password_hash) {
            const newData = req.body;
            const avatar = newData.avatar,
                oldPassword = newData.self_password,
                newPassword = newData.password,
                username = decoded.username;
            if (oldPassword && newPassword) {
                const oldHash = crypto.createHash('md5').update(oldPassword).digest('hex'),
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
                base64Img.img(avatar, 'image', Date.now(), (err, path) => {
                    if (err) throw err;
                    update('user', req.params, {$set: {avatar: path}});
                    res.status(200).type('application/json').send(JSON.stringify({info: 'avatar updated'}))
                })
            }
        } else {
            res.status(400).type('application/json').send(JSON.stringify({name: 'jwt', error: 'jwt isn\'t correct'}))
        }
    });
});
app.get('/user/friends', (req, res) => {
    const decoded = jwt.decode(req.headers.authorization, "secret");
    console.log('received jwt');
    const username = decoded.username;
    let friends = [];
    find('user_relationship', {$or: [{username_a: username}, {username_b: username}]}, s => {
        for (let i = 0; i < s.length; i++) {
            if (s[i].status) {
                friends.push({username: s[i].username_a === username? s[i].username_b : s[i].username_b});
                console.log(friends);
            }
        }
        for (let i = 0; i < friends.length; i++) {
            find("user", {username: friends[i].username}, t => {
                if (t.hasOwnProperty('avatar')) {
                    base64Img.base64(t.avatar, (err, data) => {
                        if (err) throw err;
                        friends[i].avatar = data;
                        res.type('application/json').send(JSON.stringify(friends));
                    });
                }
            });
        }
        res.type('application/json').send(JSON.stringify(friends));
    });
});

friendWs.use('/user/friends/request', (req, res, next) => {
    console.log('connected to /user/friends/request');
    next();
});
let jwtFriend;
friendWs.post('/user/friends/request', (req, res, next) => {
    console.log('get post');
    console.log('received jwt');
    res.type('application/json').send(JSON.stringify({info: 'received'}));
    next();
});
friendWs.ws('/user/friends/request', (webSocket) => {
    console.log('websocket connected');
    const decoded = jwt.decode(jwtFriend, "secret");
    console.log(decoded);
    const uid = decoded.username;
    webSockets[uid] = webSocket;
    console.log('connected :' + uid + ' in ' + Object.getOwnPropertyNames(webSockets));
    webSocket.on('message', msg => {
        console.log('received from ' + uid + ': ' + msg);
        msg = JSON.parse(msg);
        if (msg.type === 'history') {
            find('user_relationship', {username_b: uid}, s => {
                let requests = [];
                for (let i = 0; i < s.length; i++) {
                    if (!s[i].hasOwnProperty('status')) {
                        requests.push({id:s[i].id, username: s[i].username_a});
                    }
                }
                const addImage = (obj) => {
                    return new Promise(resolve => {
                        find("user", {username: obj.username}, t => {
                            if (t.hasOwnProperty('avatar')) {
                                base64Img.base64(t.avatar, (err, data) => {
                                    if (err) throw err;
                                    obj.avatar = data;
                                    resolve();
                                });
                            }
                        });
                    })
                };
                const promises = requests.map( x => {
                    return addImage(x);
                });
                Promise.all(promises).then(() => {
                    webSocket.send(JSON.stringify({type: 'history', requests: requests}));
                })
            });
        } else if (msg.type === 'send_request') {
            console.log(msg);
            find("user", {username: msg.username}, s => {
                if (s) {
                    const to = webSockets[msg.username];
                    const id = Date.now();
                    insert("user_relationship", {id: id, username_a: uid, username_b: msg.username});
                    console.log("inserted " + JSON.stringify({id: id, username_a: uid, username_b: msg.username}));
                    if (to) {
                        console.log('sent to ' + msg.username + ': ' + JSON.stringify(msg));
                        webSocket.send(JSON.stringify({type:'send_request', info: 'received'}));
                        find("user", {username: uid}, t => {
                            t = t[0];
                            if (t.hasOwnProperty('avatar')) {
                                base64Img.base64(t.avatar, (err, data) => {
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
                find("user_relationship", {username_a: msg.username, username_b: uid}, t => {
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
    webSocket.on('close', () => {
        delete webSockets[uid];
        console.log('deleted: ' + uid);
    })
});

messageWs.use('/message', (req, res, next) => {
    console.log('connected to /message');
    next();
});
let jwtMessage;
messageWs.post('/message', (req, res, next) => {
    console.log('get post');
    jwtMessage = req.body.jwt;
    res.type('application/json').send(JSON.stringify({info: 'received'}));
    next();
});
messageWs.ws('/message', webSocket => {
    console.log('websocket connected');
    const decoded = jwt.decode(jwtMessage, "secret");
    console.log(decoded);
    const uid = decoded.username;
    webSocketsMessage[uid] = webSocket;
    console.log('connected :' + uid + ' in ' + Object.getOwnPropertyNames(webSocketsMessage));
    webSocket.on('message', msg => {
        console.log('received from ' + uid + ': ' + msg);
        msg = JSON.parse(msg);
        if (msg.type === 'history') {
            const start = msg.start_time;
            const end = msg.end_time;
            find('message', {$or: [{from: uid}, {to: uid}]}, s => {
                let messages = [];
                for (let i = 0; i < s.length; i++) {
                    if (s[i].create_time > start && s[i].create_time <= end) {
                        messages.push({create_time: s[i].create_time, from: s[i].from, to: s[i].to});
                    }
                }
                const addImage = obj => {
                    return new Promise(resolve => {
                        console.log([obj]);
                        find('message', {create_time: obj.create_time}, t => {
                            t = t[0];
                            console.log('find: ', t);
                            if (t.isImage) {
                                console.log('path: ', t.content);
                                obj.image = base64Img.base64Sync(t.content);
                                resolve();
                            } else {
                                console.log('content: ', t.content);
                                obj.content = t.content;
                                resolve();
                            }
                        });
                    })
                };
                const promises = messages.map( x => {
                    return addImage(x);
                });
                Promise.all(promises).then(() => {
                    console.log(messages);
                    console.log('send message');
                    webSocket.send(JSON.stringify({type: 'history', messages: messages}));
                });
            });
        } else if (msg.type === 'send_message') {
            const to = webSocketsMessage[msg.to];
            webSocket.send(JSON.stringify({type:'send_message', info: 'received'}));
            if (msg.hasOwnProperty('image')) {
                base64Img.img(msg.image, 'image', Date.now(), (err, path) => {
                    if (err) throw err;
                    insert("message", {create_time: msg.create_time, from: uid, to: msg.to, content: path, isImage: true});
                });
            } else if (msg.hasOwnProperty('content')) {
                insert("message", {create_time: msg.create_time, from: uid, to: msg.to, content: msg.content, isImage: false});
            }
            if (to) {
                console.log('sent to ' + msg.to + ': ' + JSON.stringify(msg));
                if (msg.hasOwnProperty('image')) {
                    to.send(JSON.stringify({
                        type: 'receive_message',
                        create_time: msg.create_time,
                        from: uid,
                        to: msg.to,
                        image: msg.image
                    }));
                } else if (msg.hasOwnProperty('content')) {
                    to.send(JSON.stringify({
                        type: 'receive_message',
                        create_time: msg.create_time,
                        from: uid,
                        to: msg.to,
                        content: msg.content
                    }));
                }
            }
        } else {
            webSocket.send(JSON.stringify({type:'send_message', error: 'type error'}));
        }
    });
    webSocket.on('close', () => {
        delete webSocketsMessage[uid];
        console.log('deleted: ' + uid);
    })

});

app.listen(7341);