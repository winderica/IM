/**
 * import modules
 */
const crypto = require('crypto');
const base64Img = require('base64-img');
const express = require('express');
const app = express();
const expressWs1 = require('express-ws')(app);
const expressWs2 = require('express-ws')(app);
const friendWs = expressWs1.app;
const messageWs = expressWs2.app;
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const insert = require('./db/database').insertData;
const find = require('./db/database').findData;
const update = require('./db/database').updateData;
const remove = require('./db/database').removeData;

let webSockets = {};
let webSocketsMessage = {};

/**
 * middle wares
 */
app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

/************* HTTP part *************/

/**
 * handler of login
 */
app.post('/user/login', (req, res) => {
    console.log('connected to /user/login');
    const msg = req.body,
        username = msg.username,
        password = msg.password,
        password_hash = crypto.createHash('md5').update(password).digest('hex');
    find('user', { username: username }, t => {
        if (!t[0]) {
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'username',
                error: 'username is not correct'
            }));
        } else if (t[0].password_hash === password_hash) {
            res.status(200).type('application/json').send(JSON.stringify({
                jwt: jwt.encode({
                    username: username,
                    password_hash: password_hash
                }, 'secret')
            }));
        } else {
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'password',
                error: 'password is not correct'
            }));
        }
    });
});

/**
 * handler of register
 */
app.post('/user/register', (req, res) => {
    console.log('connected to /user/register');
    const msg = req.body,
        username = msg.username,
        password = msg.password;
    find('user', { username: username }, t => {
        if (t[0]) {
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'username',
                error: 'this username has already been registered'
            }));
        } else {
            const obj = {
                username: username,
                password_hash: crypto.createHash('md5').update(password).digest('hex')
            };
            insert('user', obj);
            res.status(201).type('application/json').send(JSON.stringify({ jwt: jwt.encode(obj, 'secret') }));
        }
    });
});

/**
 * handler of getting user info
 */
app.get('/user', (req, res) => {
    console.log('connected to /user');
    const decoded = jwt.decode(req.headers.authorization, "secret");
    find('user', { username: decoded.username }, s => {
        if (s[0].password_hash === decoded.password_hash) {
            if (s[0].hasOwnProperty('avatar')) {
                const data = base64Img.base64Sync(s[0].avatar);
                res.status(200).type('application/json').send(JSON.stringify({username: s[0].username, password_hash: s[0].password_hash, avatar: data}));
            } else {
                res.status(200).type('application/json').send(JSON.stringify({username: s[0].username, password_hash: s[0].password_hash}));
            }
        } else {
            res.status(400).type('application/json').send(JSON.stringify({name: 'jwt', error: 'jwt isn\'t correct'}))
        }
    });
});

/**
 * handler of updating user info
 */
app.patch('/user', (req, res) => {
    console.log('patch to /user');
    const decoded = jwt.decode(req.headers.authorization, "secret");
    find('user', { username: decoded.username }, s => {
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
                    res.status(400).type('application/json').send(JSON.stringify({
                        name: 'password',
                        error: 'new password should not be same as former'
                    }));
                } else if (oldHash === s[0].password_hash) {
                    update('user', { username: s[0].username }, { $set: { password_hash: newHash } });
                    res.status(200).type('application/json').send(JSON.stringify({
                        username: username,
                        password: newPassword
                    }));
                } else {
                    res.status(400).type('application/json').send(JSON.stringify({
                        name: 'self_password',
                        error: 'old password is not correct'
                    }));
                }
            }
            if (avatar) {
                let path = base64Img.imgSync(avatar, 'image', Date.now());
                update('user', { username: s[0].username }, { $set: { avatar: path } });
                res.status(200).type('application/json').send(JSON.stringify({ info: 'avatar updated' }));
            }
        } else {
            res.status(400).type('application/json').send(JSON.stringify({
                name: 'jwt',
                error: 'jwt isn\'t correct'
            }));
        }
    });
});

/**
 * handler of getting friends list
 */
app.get('/user/friends', (req, res) => {
    console.log('connect to /user/friends');
    const decoded = jwt.decode(req.headers.authorization, "secret");
    const username = decoded.username;
    let friends = [];
    find('user_relationship', { $or: [{ username_a: username }, { username_b: username }] }, s => {
        for (let i = 0; i < s.length; i++) {
            if (s[i].status) {
                friends.push({ username: s[i].username_a === username ? s[i].username_b : s[i].username_a });
            }
        }
        const addImage = (obj) => {
            return new Promise(resolve => {
                find("user", {username: obj.username}, t => {
                    t = t[0];
                    if (t.avatar) {
                        obj.avatar = base64Img.base64Sync(t.avatar);
                    }
                    resolve();
                });
            })
        };
        const promises = friends.map(x => {
            return addImage(x);
        });
        Promise.all(promises).then(() => {
            res.type('application/json').send(JSON.stringify(friends));
        });
    });
});

/************* WebSocket part *************/

/**
 * handling friend request
 */
friendWs.use('/user/friends/request', (req, res, next) => {
    console.log('connected to /user/friends/request');
    next();
});
let jwtFriend;
friendWs.post('/user/friends/request', (req, res, next) => {
    jwtFriend = req.body.jwt;
    res.type('application/json').send(JSON.stringify({info: 'received'}));
    next();
});
friendWs.ws('/user/friends/request', webSocket => {
    const decoded = jwt.decode(jwtFriend, "secret");
    const uid = decoded.username;
    webSockets[uid] = webSocket;
    webSocket.on('message', msg => {
        msg = JSON.parse(msg);
        if (msg.type === 'history') {
            find('user_relationship', { username_b: uid }, s => {
                let requests = [];
                for (let i = 0; i < s.length; i++) {
                    if (!s[i].hasOwnProperty('status')) {
                        requests.push({
                            id:s[i].id,
                            username: s[i].username_a
                        });
                    }
                }
                const addImage = (obj) => {
                    return new Promise(resolve => {
                        find("user", {username: obj.username}, t => {
                            t = t[0];
                            if (t.avatar) {
                                obj.avatar = base64Img.base64Sync(t.avatar);
                            }
                            resolve();
                        });
                    });
                };
                const promises = requests.map( x => {
                    return addImage(x);
                });
                Promise.all(promises).then(() => {
                    webSocket.send(JSON.stringify({
                        type: 'history',
                        requests: requests
                    }));
                });
            });
        } else if (msg.type === 'send_request') {
            if (msg.username === uid) {
                webSocket.send(JSON.stringify({
                    type:'send_request',
                    error: 'request yourself'
                }));
            } else {
                find("user_relationship", { username_b: msg.username }, r => {
                    if (r) {
                        webSocket.send(JSON.stringify({
                            type:'send_request',
                            error: 'duplicate friend request'
                        }));
                    } else {
                        find("user", { username: msg.username }, s => {
                            if (s) {
                                const to = webSockets[msg.username];
                                const id = Date.now();
                                insert("user_relationship", {
                                    id: id,
                                    username_a: uid,
                                    username_b: msg.username
                                });
                                if (to) {
                                    webSocket.send(JSON.stringify({
                                        type:'send_request',
                                        info: 'received'
                                    }));
                                    find("user", { username: uid }, t => {
                                        t = t[0];
                                        if (t.avatar) {
                                            const data = base64Img.base64Sync(t.avatar);
                                            to.send(JSON.stringify({
                                                id: id,
                                                type: 'receive_request',
                                                username: uid,
                                                avatar: data
                                            }));
                                        } else {
                                            to.send(JSON.stringify({
                                                id: id,
                                                type: 'receive_request',
                                                username: uid
                                            }));
                                        }
                                    });
                                }
                            } else {
                                webSocket.send(JSON.stringify({
                                    type:'send_request',
                                    name: 'username',
                                    error: 'username doesn\'t exist'
                                }));
                            }
                        })
                    }
                })
            }
        } else if (msg.type === 'reject_request') {
            if (msg.id) { // reject friend request
                remove("user_relationship", { id: msg.id });
                webSocket.send(JSON.stringify({
                    type:'reject_request',
                    info: 'rejected'
                }));
            }
            if (msg.username) { // delete friend
                find("user_relationship", {username_a: msg.username, username_b: uid}, t => {
                    if (t) {
                        remove("user_relationship", {
                            username_a: msg.username,
                            username_b: uid
                        });
                    } else {
                        remove("user_relationship", {
                            username_b: msg.username,
                            username_a: uid
                        });
                    }
                });
                webSocket.send(JSON.stringify({
                    type:'reject_request',
                    info: 'deleted'
                }));
            }
        } else if (msg.type === 'agree_request') {
            if (msg.id) {
                update("user_relationship", { id: msg.id }, { $set: { status: true } });
                webSocket.send(JSON.stringify({
                    type:'agree_request',
                    info: 'accepted'
                }));
            }
        } else {
            webSocket.send(JSON.stringify({ info: 'type error' }));
        }
    });
    webSocket.on('close', () => {
        delete webSockets[uid];
    })
});

/**
 * handling message
 */
messageWs.use('/message', (req, res, next) => {
    console.log('connected to /message');
    next();
});
let jwtMessage;
messageWs.post('/message', (req, res, next) => {
    jwtMessage = req.body.jwt;
    res.type('application/json').send(JSON.stringify({info: 'received'}));
    next();
});
messageWs.ws('/message', webSocket => {
    const decoded = jwt.decode(jwtMessage, "secret");
    const uid = decoded.username;
    webSocketsMessage[uid] = webSocket;
    webSocket.on('message', msg => {
        msg = JSON.parse(msg);
        if (msg.type === 'history') {
            const start = msg.start_time;
            const end = msg.end_time;
            find('message', { $or: [{ from: uid }, { to: uid }] }, s => {
                let messages = [];
                for (let i = 0; i < s.length; i++) {
                    if (s[i].create_time > start && s[i].create_time <= end) {
                        messages.push({
                            create_time: s[i].create_time,
                            from: s[i].from,
                            to: s[i].to
                        });
                    }
                }
                const addImage = obj => {
                    return new Promise(resolve => {
                        find('message', { create_time: obj.create_time }, t => {
                            t = t[0];
                            if (t.isImage) {
                                obj.image = base64Img.base64Sync(t.content);
                            } else {
                                obj.content = t.content;
                            }
                            resolve();
                        });
                    })
                };
                const promises = messages.map( x => {
                    return addImage(x);
                });
                Promise.all(promises).then(() => {
                    webSocket.send(JSON.stringify({
                        type: 'history',
                        messages: messages
                    }));
                });
            });
        } else if (msg.type === 'send_message') {
            const to = webSocketsMessage[msg.to];
            webSocket.send(JSON.stringify({type:'send_message', info: 'received'}));
            if (msg.hasOwnProperty('image')) {
                base64Img.img(msg.image, 'image', Date.now(), (err, path) => {
                    if (err) throw err;
                    insert("message", {
                        create_time: msg.create_time,
                        from: uid,
                        to: msg.to,
                        content: path,
                        isImage: true
                    });
                });
            } else if (msg.hasOwnProperty('content')) {
                insert("message", {
                    create_time: msg.create_time,
                    from: uid,
                    to: msg.to,
                    content: msg.content,
                    isImage: false
                });
            }
            if (to) {
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
            webSocket.send(JSON.stringify({
                type:'send_message',
                error: 'type error'
            }));
        }
    });
    webSocket.on('close', () => {
        delete webSocketsMessage[uid];
    });
});

app.listen(7341);