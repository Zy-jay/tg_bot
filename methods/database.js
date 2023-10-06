const pg = require("pg");

const pool = new pg.Pool({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || "5432", 10),
    database: process.env.DATABASE_NAME,
    keepAlive: true,
    idleTimeoutMillis: 0,
    max: 100
});

module.exports = pool;