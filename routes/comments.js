// server\routes\comment.js
import express from 'express'
const router = express.Router()
import sequelize from '#configs/db.js'
import authenticate from '#middlewares/authenticate.js'

// GET - 獲取待評價訂單清單
router.get('/pending', authenticate, async (req, res) => {
  const user_id = req.user.id

  try {
    // 查詢待評價的商品訂單，排除已評價的商品
    const pendingReviews = await sequelize.query(
      `
      SELECT
    orders.order_date,
    order_items.product_id,
    order_items.quantity,
    order_items.size,
    order_items.price,
    order_items.discount_price,
    product.product_name,
    product_brand.name AS product_brand_name,
    product_category.name AS category_name,
    (
        SELECT
            product_picture.picture_url
        FROM
            product_picture
        WHERE
            product_picture.product_id = product.id AND product_picture.picture_url LIKE '%-1.%'
        LIMIT 1
    ) AS picture_url
FROM
    order_items
JOIN product ON order_items.product_id = product.id
JOIN product_brand ON product.brand_id = product_brand.id
JOIN product_category ON product.category_id = product_category.id
LEFT JOIN member_comment ON order_items.product_id = member_comment.product_id 
    AND order_items.user_id = member_comment.user_id 
    AND order_items.size = member_comment.size -- 加入尺寸條件
JOIN orders ON order_items.order_id = orders.order_id
WHERE
    order_items.user_id = :user_id
    AND orders.delivery_status = 1 
    AND orders.payment_status = 1 
    AND member_comment.product_id IS NULL; -- 確保該商品及尺寸尚未評價

      `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    return res.json({
      status: 'success',
      data: pendingReviews,
    })
  } catch (error) {
    console.error('無法獲取待評價清單:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法獲取待評價清單' })
  }
})

// GET - 取得會員的評價清單，並勾稽商品資訊
router.get('/list', authenticate, async (req, res) => {
  const user_id = req.user.id

  try {
    // 查詢會員的評價，並關聯商品資訊
    const comments = await sequelize.query(
      `
      SELECT
          member_comment.id,
          member_comment.product_id,
          member_comment.rating,
          member_comment.comment,
          product.product_name,
          product_brand.name AS product_brand_name,
          product_category.name AS category_name,
          order_items.size,
          orders.order_date,
          order_items.price,
          order_items.discount_price,
          (
          SELECT
              product_picture.picture_url
          FROM
              product_picture
          WHERE
              product_picture.product_id = product.id AND product_picture.picture_url LIKE '%-1.%'
          LIMIT 1
          ) AS picture_url
      FROM
          member_comment
      JOIN product ON member_comment.product_id = product.id
      JOIN product_brand ON product.brand_id = product_brand.id
      JOIN product_category ON product.category_id = product_category.id
      LEFT JOIN order_items ON member_comment.product_id = order_items.product_id        
      AND member_comment.size = order_items.size -- 加入尺寸條件
      JOIN orders ON order_items.order_id = orders.order_id
      WHERE
          member_comment.user_id = :user_id
          AND orders.delivery_status = 1 
      AND orders.payment_status = 1 
      GROUP BY
          member_comment.id
      ORDER BY
          member_comment.id DESC

      `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    // 檢查是否有查詢結果
    if (comments.length > 0) {
      return res.json({
        status: 'success',
        data: comments,
      })
    } else {
      return res.json({
        status: 'success',
        data: [],
        message: '尚無評價紀錄',
      })
    }
  } catch (error) {
    console.error('取得評價清單錯誤:', error)
    return res.status(500).json({
      status: 'error',
      message: '無法取得評價清單',
    })
  }
})

router.get('/check/:product_id/:size', authenticate, async (req, res) => {
  const user_id = req.user.id
  const { product_id } = req.params
  let size = decodeURIComponent(req.params.size) // 解碼 size

  try {
    // 強制將 size 的 NULL 處理為空字串
    size = size || ''

    // 查詢該會員是否已對該商品的特定尺寸評價
    const [comment] = await sequelize.query(
      `
      SELECT rating, comment 
      FROM member_comment
      WHERE user_id = :user_id 
        AND product_id = :product_id 
        AND size = :size
      `,
      {
        replacements: { user_id, product_id, size },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (comment && comment.rating && comment.comment) {
      return res.json({
        status: 'success',
        data: {
          hasCommented: true,
          rating: comment.rating,
          comment: comment.comment,
        },
      })
    } else {
      return res.json({
        status: 'success',
        data: { hasCommented: false },
      })
    }
  } catch (error) {
    console.error('檢查評價狀態錯誤:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法檢查評價狀態' })
  }
})

// POST - 新增或更新評價資料
router.post('/add', authenticate, async (req, res) => {
  const user_id = req.user.id;
  const { product_id, rating, comment } = req.body;
  let { size } = req.body;

  try {
    if (!product_id || !rating || typeof comment !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: '商品ID、評分和評價內容為必填欄位',
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        status: 'error',
        message: '評分必須介於 1 到 5 分之間',
      });
    }

    // 處理 size，空值轉為 ''
    size = size || '';

    // 確認該商品是否存在於會員的歷史訂單中
    const [orderHistory] = await sequelize.query(
      `
      SELECT 1
      FROM order_items
      JOIN orders ON order_items.order_id = orders.order_id
      WHERE order_items.user_id = :user_id 
        AND order_items.product_id = :product_id 
        AND size = :size
      `,
      {
        replacements: { user_id, product_id, size },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!orderHistory) {
      return res.status(400).json({
        status: 'error',
        message: '您尚未購買過該商品，無法評價',
      });
    }

    // 檢查是否已有評價
    const [existingComment] = await sequelize.query(
      `
      SELECT * 
      FROM member_comment 
      WHERE user_id = :user_id 
        AND product_id = :product_id 
        AND size = :size
      `,
      {
        replacements: { user_id, product_id, size },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (existingComment) {
      // 更新評價
      await sequelize.query(
        `
        UPDATE member_comment
        SET rating = :rating, comment = :comment
        WHERE user_id = :user_id 
          AND product_id = :product_id 
          AND size = :size
        `,
        {
          replacements: { user_id, product_id, size, rating, comment },
          type: sequelize.QueryTypes.UPDATE,
        }
      );

      return res.json({
        status: 'success',
        message: '評價已成功更新',
      });
    } else {
      // 新增評價
      await sequelize.query(
        `
        INSERT INTO member_comment (product_id, size, user_id, rating, comment)
        VALUES (:product_id, :size, :user_id, :rating, :comment)
        `,
        {
          replacements: { product_id, size, user_id, rating, comment },
          type: sequelize.QueryTypes.INSERT,
        }
      );

      return res.json({
        status: 'success',
        message: '評價已成功新增',
      });
    }
  } catch (error) {
    console.error('評價處理錯誤:', error);
    return res.status(500).json({
      status: 'error',
      message: '無法處理評價，請稍後再試',
    });
  }
});


// GET - 根據商品 ID 獲取評價列表
router.get('/product/:product_id', async (req, res) => {
  const { product_id } = req.params
  const { sort } = req.query // 可選的排序參數

  try {
    // 排序條件處理，預設按最新評論排序
    let orderBy = 'ORDER BY mc.created_at DESC'
    if (sort === 'oldest') {
      orderBy = 'ORDER BY mc.created_at ASC'
    } else if (sort === 'high') {
      orderBy = 'ORDER BY mc.rating DESC'
    } else if (sort === 'low') {
      orderBy = 'ORDER BY mc.rating ASC'
    }

    // 查詢評論
    const comments = await sequelize.query(
      `
      SELECT 
        mc.id, 
        mc.product_id, 
        u.account AS nickname, 
        mc.rating, 
        mc.comment, 
        mc.created_at
      FROM member_comment mc
      JOIN user u ON mc.user_id = u.id
      WHERE mc.product_id = :product_id
      ${orderBy}
      `,
      {
        replacements: { product_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    // 計算平均評分和評論總數
    const [summary] = await sequelize.query(
      `
      SELECT 
        AVG(mc.rating) AS averageRating, 
        COUNT(mc.id) AS totalReviews
      FROM member_comment mc
      WHERE mc.product_id = :product_id
      `,
      {
        replacements: { product_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    res.json({
      status: 'success',
      data: {
        reviews: comments,
        averageRating: summary.averageRating || 0,
        totalReviews: summary.totalReviews || 0,
      },
    })
  } catch (error) {
    console.error('Error fetching comments:', error)
    res.status(500).json({ status: 'error', message: '無法取得評論' })
  }
})

export default router
