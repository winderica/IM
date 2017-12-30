const MongoClient = require('mongodb').MongoClient;
const url = "mongodb://localhost:27017/test";

function initialize() {
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.createCollection("user", function (err) {
            if (err) throw err;
            db.close();
        });
    });
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.createCollection("user_relationship", function (err) {
            if (err) throw err;
            db.close();
        });
    });
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.createCollection("message", function (err) {
            if (err) throw err;
            db.close();
        });
    });

    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.createCollection("image", function (err) {
            if (err) throw err;
            db.close();
        });
    });
}
initialize();

function insert(collectionName, data) {
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.collection(collectionName).insertOne(data, function (err) {
            if (err) throw err;
            db.close();
        });
    });
}

function find(collectionName, data, func) {
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.collection(collectionName).find(data).toArray(function (err, result) {
            if (err) {
                func();
            }
            db.close();
            func(result);
        });
    });
}

function update(collectionName, data, newData) {
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        const database = db.db('test');
        database.collection(collectionName).updateOne(data, newData, function (err) {
            if (err) throw err;
            db.close();
        });
    });
}

exports.insertData = insert;
exports.findData = find;
exports.updateData = update;