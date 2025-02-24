import express from 'express'
const router = express.Router()

// 檢查空物件, 轉換 req.params 為數字
import { getIdParam } from '#db-helpers/db-tool.js'

import authenticate from '#middlewares/authenticate.js'
import sequelize from '#configs/db.js'

// 獲得某會員 id 加入到我的最愛清單中的課程 id 列表
// 此路由只有登入會員能使用
router.get('/', authenticate, async (req, res) => {
  const uid = req.user.id

  try {
    const [favorites] = await sequelize.query(
      `SELECT course_id FROM course_like WHERE uid = ?`,
      { replacements: [uid], type: sequelize.QueryTypes.SELECT }
    )

    res.json({ status: 'success', data: { favorites: favorites.map(fav => fav.course_id) } })
  } catch (error) {
    console.error('無法取得資料:', error)
    res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// 新增課程到我的最愛清單
router.put('/:id', authenticate, async (req, res) => {
  const course_id = getIdParam(req)
  const uid = req.user.id

  try {
    // 檢查資料是否已存在
    const [existLike] = await sequelize.query(
      `SELECT * FROM course_like WHERE course_id = ? AND uid = ?`,
      { replacements: [course_id, uid], type: sequelize.QueryTypes.SELECT }
    )

    if (existLike) {
      return res.json({ status: 'error', message: '資料已經存在，新增失敗' })
    }

    // 新增資料到 course_like
    const [result] = await sequelize.query(
      `INSERT INTO course_like (course_id, uid) VALUES (?, ?)`,
      { replacements: [course_id, uid] }
    )

    if (!result) {
      return res.json({
        status: 'error',
        message: '新增失敗',
      })
    }

    return res.json({ status: 'success', data: null })
  } catch (error) {
    console.error('新增失敗:', error)
    res.status(500).json({ status: 'error', message: '新增失敗' })
  }
})

// 從我的最愛清單中刪除課程
router.delete('/:id', authenticate, async (req, res) => {
  const course_id = getIdParam(req)
  const uid = req.user.id

  try {
    const [result] = await sequelize.query(
      `DELETE FROM course_like WHERE course_id = ? AND uid = ?`,
      { replacements: [course_id, uid] }
    )

    if (result.affectedRows === 0) {
      return res.json({
        status: 'error',
        message: '刪除失敗',
      })
    }

    return res.json({ status: 'success', data: null })
  } catch (error) {
    console.error('刪除失敗:', error)
    res.status(500).json({ status: 'error', message: '刪除失敗' })
  }
})

export default router