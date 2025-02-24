// routes/course.js
import express from 'express'
const router = express.Router()

// 資料庫連線
import sequelize from '#configs/db.js'

// GET - 取得所有資料
router.get('/', async function (req, res) {
  try {
    // 使用原生 SQL 查詢所有資料
    const [course] = await sequelize.query(`
  SELECT course.*, 
       shop.shop_name, 
       shop.shop_address, 
       shop.shop_phone
FROM course
JOIN shop ON course.shop_id = shop.id;

`)

    // 標準回傳 JSON
    return res.json({ status: 'success', data: { course } })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// JOIN course_like ON course.id = course_like.course_id

// GET - 根據 cid 取得特定課程資料
router.get('/:cid', async function (req, res) {
  const { cid } = req.params
  try {
    // 使用原生 SQL 查詢特定課程資料
    const [course] = await sequelize.query(`
      SELECT * FROM course WHERE id = ?
    `, {
      replacements: [cid]
    })

    if (course.length === 0) {
      return res.status(404).json({ status: 'error', message: '課程未找到' })
    }

     // 更新點擊次數
     await sequelize.query(`
      UPDATE course SET click_count = click_count + 1 WHERE id = ?
    `, {
      replacements: [cid]
    })

    // 標準回傳 JSON
    return res.json({ status: 'success', data: { course: course[0] } })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

export default router