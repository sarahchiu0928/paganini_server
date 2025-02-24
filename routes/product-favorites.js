import express from 'express'
const router = express.Router()

// 檢查空物件, 轉換req.params為數字
import { getIdParam } from '#db-helpers/db-tool.js'

import authenticate from '#middlewares/authenticate.js'
import sequelize from '#configs/db.js'

// 獲得某會員id的有加入到我的最愛清單中的商品id們
// 此路由只有登入會員能使用
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;

  try {
    const favorites = await sequelize.query(
      `SELECT p.id AS product_id, 
       p.product_name, 
       IFNULL(p.discount_price, p.price) AS display_price,
       pb.name AS brand_name, 
       product_picture.picture_url AS first_picture
      FROM product_like AS pl
      JOIN product AS p ON pl.product_id = p.id
      JOIN product_brand AS pb ON p.brand_id = pb.id
      LEFT JOIN product_picture ON p.id = product_picture.product_id 
          AND product_picture.picture_url LIKE '%-1.%' 
      WHERE pl.user_id = :user_id`,
      {
        replacements: { user_id: userId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({ status: 'success', data: { favorites } });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ status: 'error', message: '無法取得收藏清單' });
  }
});


//新增商品至我的收藏
router.put('/:id', authenticate, async (req, res, next) => {
  const pid = getIdParam(req)
  const uid = req.user.id

  try {
    // 檢查是否已存在於我的最愛
    const [existing] = await sequelize.query(
      `SELECT * FROM product_like WHERE user_id = :uid AND product_id = :pid`,
      {
        replacements: { uid, pid },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (existing) {
      return res.json({ status: 'error', message: '資料已經存在，新增收藏失敗' });
    }

    // 執行新增
    await sequelize.query(
      `INSERT INTO product_like (user_id, product_id) VALUES (:uid, :pid)`,
      {
        replacements: { uid, pid },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    res.json({ status: 'success', data: null });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).json({ status: 'error', message: '新增至收藏失敗' });
  }
});

//從收藏中移除商品
router.delete('/:id', authenticate, async (req, res, next) => {
  const pid = getIdParam(req)
  const uid = req.user.id

  try {
    // 執行刪除
    const result = await sequelize.query(
      `DELETE FROM product_like WHERE user_id = :uid AND product_id = :pid`,
      {
        replacements: { uid, pid },
        type: sequelize.QueryTypes.DELETE,
      }
    );

    // 修改這裡的判斷條件
    if (!result || result[0].affectedRows === 0) {
      return res.json({
        status: 'success', // 即使沒有刪除任何資料也回傳成功
        data: null,
        message: '已從收藏中移除',
      });
    }

    res.json({
      status: 'success',
      data: null,
      message: '已從收藏中移除'
    });
  } catch (error) {
    console.error('Error removing from favorites:', error);
    res.status(500).json({
      status: 'error',
      message: '刪除收藏商品失敗',
      error: error.message
    });
  }
});

export default router
