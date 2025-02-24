import express from 'express'
const router = express.Router()

// 檢查空物件, 轉換req.params為數字
import { getIdParam } from '#db-helpers/db-tool.js'

import authenticate from '#middlewares/authenticate.js'
import sequelize from '#configs/db.js'
const { Favorite } = sequelize.models

// 獲得某會員id的有加入到我的最愛清單中的商品id們
// 此路由只有登入會員能使用
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    const favorites = await sequelize.query(
      `
    SELECT
    cf.id AS course_like_id,
    cf.user_id,
    cf.course_id,
    c.course_name,
    c.course_summary,
    c.course_teacher,
    c.course_price,
    c.course_img,
    c.course_discount_price,
    c.course_start_date
FROM
    course_like cf
JOIN course c ON
    cf.course_id = c.id
WHERE
    cf.user_id = :userId;
`,
      {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    if (!userId) {
      return res.status(400).json({ status: 'error', message: '缺少會員ID' })
    }
    
    // 標準回傳 JSON
    return res.json({ status: 'success', data: { favorites } })
      } catch (error) {
        console.error('無法取得資料:', error)
        return res.status(500).json({ status: 'error', message: '無法取得會員課程資料' })
      }
    })

// 新增收藏
router.put('/:id', authenticate, async (req, res) => {
  const cid = req.params.id;
  const uid = req.user.id;

  try {
      const [result] = await sequelize.query(
          `SELECT * FROM course_like WHERE user_id = :uid AND course_id = :cid`,
          {
              replacements: { uid, cid },
              type: sequelize.QueryTypes.SELECT,
          }
      );

      if (result) {
          return res.json({
              status: 'error',
              message: '此課程已收藏過了',
          });
      }

      await sequelize.query(
          `INSERT INTO course_like (user_id, course_id) VALUES (:uid, :cid)`,
          {
              replacements: { uid, cid },
              type: sequelize.QueryTypes.INSERT,
          }
      );

      return res.json({
          status: 'success',
          message: '新增收藏成功',
          data: { user_id: uid, course_id: cid },
      });
  } catch (error) {
      console.error('新增收藏失敗:', error);
      return res.status(500).json({
          status: 'error',
          message: '新增收藏失敗',
          error: error.message,
      });
  }
});

// 移除收藏
router.delete('/:id', authenticate, async (req, res) => {
  const cid = req.params.id;
  const uid = req.user.id;

  try {
      const result = await sequelize.query(
          `DELETE FROM course_like WHERE user_id = :uid AND course_id = :cid`,
          {
              replacements: { uid, cid },
              type: sequelize.QueryTypes.DELETE,
          }
      );

      if (!result || result[0].affectedRows === 0) {
          return res.json({
              status: 'success',
              data: null,
              message: '已從收藏中移除',
          });
      }

      return res.json({
          status: 'success',
          message: '已成功移除收藏',
          data: null,
      });
  } catch (error) {
      console.error('移除收藏失敗:', error);
      return res.status(500).json({
          status: 'error',
          message: '移除收藏失敗',
          error: error.message,
      });
  }
});

export default router
