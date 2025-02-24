// routes/course.js
import express from 'express'
const router = express.Router()

// 資料庫連線
import sequelize from '#configs/db.js'

// GET - 取得所有資料
router.get('/', async function (req, res) {
  try {
    // 使用原生 SQL 查詢所有資料
    const [coupon] = await sequelize.query(`
  SELECT * FROM coupon
`)

    // 標準回傳 JSON
    return res.json({ status: 'success', data: { coupon } })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})


export default router