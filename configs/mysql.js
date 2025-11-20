import pg from 'pg'
const { Pool } = pg

// 讀取.env檔用
import 'dotenv/config.js'

// 資料庫連結資訊
const db = new Pool({
  host: process.env.PG_DB_HOST,
  user: process.env.PG_DB_USERNAME,
  port: process.env.PG_DB_PORT,
  password: process.env.PG_DB_PASSWORD,
  database: process.env.PG_DB_DATABASE,
  ssl: {
    rejectUnauthorized: false,
  },
})

// 輸出模組
export default db
