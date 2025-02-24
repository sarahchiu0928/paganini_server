// server\routes\cart.js
import express from 'express'
import sequelize from '#configs/db.js'
import authenticate from '#middlewares/authenticate.js'

const router = express.Router()

// GET - 取得"登入會員ID"的購物車資料
router.get('/', authenticate, async (req, res) => {
  const user_id = req.user.id
  try {
    const cart = await sequelize.query(
      `
      SELECT 
        cart.id AS cart_id,
        cart.user_id,
        cart.product_id,
        cart.quantity,
        cart.checked AS card_checked,
        product.product_name,
        product_brand.name AS product_brand_name,
        product_category.name AS category_name,
        product.price,
        product.discount_price,
        product_size.size,
        product_size.stock,
        (
            SELECT product_picture.picture_url
            FROM product_picture
            WHERE product_picture.product_id = product.id
              AND product_picture.picture_url LIKE '%-1.%'
            LIMIT 1
        ) AS picture_url
      FROM 
        cart
      JOIN 
        product ON cart.product_id = product.id -- 取得對應商品資料
      JOIN 
        product_brand ON product.brand_id = product_brand.id -- 取得對應商品品牌資料
      JOIN 
        product_category ON product.category_id = product_category.id -- 取得對應商品類別資料
      LEFT JOIN 
        product_size ON product_size.product_id = product.id
        AND product_size.size = cart.size -- 取得對應商品尺寸資料
      WHERE 
        cart.user_id = :user_id; -- 用戶的 ID`,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )
    return res.json({ status: 'success', data: cart })
  } catch (error) {
    console.error('無法取得購物車資料:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法取得購物車資料' })
  }
})

// POST - 檢查購物車中的產品數量
router.post('/check', authenticate, async (req, res) => {
  const user_id = req.user.id
  const { product_id, size } = req.body

  try {
    const [cartItem] = await sequelize.query(
      `SELECT quantity FROM cart WHERE user_id = ? AND product_id = ? AND size = ?`,
      {
        replacements: [user_id, product_id, size],
        type: sequelize.QueryTypes.SELECT,
      }
    )

    res.json({ quantity: cartItem?.quantity || 0 })
  } catch (error) {
    console.error('無法檢查購物車數量:', error)
    res.status(500).json({ status: 'error', message: '無法檢查購物車數量' })
  }
})

// GET - 取得"登入會員ID"購物車中已勾選商品的數量
router.get('/checkedCount', authenticate, async (req, res) => {
  const user_id = req.user.id // 從 authenticate middleware 獲取用戶 ID

  try {
    const [result] = await sequelize.query(
      `
      SELECT
          SUM(quantity) AS checkedCount
      FROM
          cart
      WHERE
          user_id = :user_id AND checked = 1; -- 僅計算勾選的商品數量總和

      `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    return res.json({
      status: 'success',
      data: {
        checkedCount: result.checkedCount,
      },
    })
  } catch (error) {
    console.error('無法取得已勾選商品數量:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法取得已勾選商品數量' })
  }
})


// POST - 新增商品至購物車
router.post('/add', authenticate, async (req, res) => {
  const user_id = req.user.id
  const { product_id, quantity, size } = req.body // size 現在表示尺寸名稱

  try {
    // 檢查購物車中是否已存在相同產品和尺寸
    const [existingItem] = await sequelize.query(
      `SELECT * FROM cart WHERE user_id = ? AND product_id = ? AND size = ?`,
      {
        replacements: [user_id, product_id, size], // size 代表尺寸名稱
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (existingItem) {
      // 如果該尺寸的產品已存在於購物車中，則增加數量
      await sequelize.query(
        `UPDATE cart SET quantity = quantity + ? WHERE user_id = ? AND product_id = ? AND size = ?`,
        {
          replacements: [quantity, user_id, product_id, size],
          type: sequelize.QueryTypes.UPDATE,
        }
      )
      return res.json({ status: 'success', message: '商品數量已更新' })
    } else {
      // 若產品不存在於購物車中，則新增一筆資料
      await sequelize.query(
        `INSERT INTO cart (user_id, product_id, quantity, size) VALUES (?, ?, ?, ?);`,
        {
          replacements: [user_id, product_id, quantity, size],
          type: sequelize.QueryTypes.INSERT,
        }
      )
      return res.json({ status: 'success', message: '商品已加入購物車' })
    }
  } catch (error) {
    console.error('無法加入購物車:', error)
    return res.status(500).json({ status: 'error', message: '無法加入購物車' })
  }
})

// PUT - 更新購物車商品[單選]勾選狀態
router.put('/updateChecked', authenticate, async (req, res) => {
  const user_id = req.user.id
  const { product_id, checked, size } = req.body

  try {
    await sequelize.query(
      `UPDATE cart SET checked = ? WHERE user_id = ? AND product_id = ? AND size = ?`,
      {
        replacements: [checked, user_id, product_id, size],
        type: sequelize.QueryTypes.UPDATE,
      }
    )
    return res.json({ status: 'success', message: '勾選狀態已更新' })
  } catch (error) {
    console.error('無法更新勾選狀態:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法更新勾選狀態' })
  }
})

// PUT - 更新購物車商品[全選]勾選狀態
router.put('/updateAllChecked', authenticate, async (req, res) => {
  const user_id = req.user.id
  const { checked } = req.body

  try {
    await sequelize.query(`UPDATE cart SET checked = ? WHERE user_id = ?`, {
      replacements: [checked, user_id],
      type: sequelize.QueryTypes.UPDATE,
    })
    return res.json({ status: 'success', message: '所有商品的勾選狀態已更新' })
  } catch (error) {
    console.error('無法更新全選勾選狀態:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法更新全選勾選狀態' })
  }
})

// PUT - 更新購物車商品數量
router.put('/updateQuantity', authenticate, async (req, res) => {
  const user_id = req.user.id // 使用 authenticate 後的 user_id
  const { product_id, quantity, size } = req.body

  try {
    // 檢查該產品的庫存
    const [sizeInfo] = await sequelize.query(
      `SELECT stock FROM product_size WHERE product_id = ? AND size = ?`,
      {
        replacements: [product_id, size],
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (!sizeInfo) {
      // 如果找不到對應的產品尺寸，返回錯誤
      return res
        .status(404)
        .json({ status: 'error', message: '該產品尺寸不存在' })
    }

    if (quantity > sizeInfo.stock) {
      // 檢查數量是否超過庫存
      return res.status(400).json({
        status: 'error',
        message: `數量超出庫存，最大可選購數量為 ${sizeInfo.stock}`,
      })
    }

    // 檢查購物車中是否已存在該產品
    const [existingItem] = await sequelize.query(
      `SELECT * FROM cart WHERE user_id = ? AND product_id = ? AND size = ?`,
      {
        replacements: [user_id, product_id, size],
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (existingItem) {
      // 如果該產品存在於購物車中，更新數量
      await sequelize.query(
        `UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ? AND size = ?`,
        {
          replacements: [quantity, user_id, product_id, size],
          type: sequelize.QueryTypes.UPDATE,
        }
      )
      return res.json({ status: 'success', message: '數量已更新' })
    } else {
      // 若產品不存在於購物車中
      return res
        .status(404)
        .json({ status: 'error', message: '該商品不存在於購物車中' })
    }
  } catch (error) {
    console.error('無法更新數量:', error)
    return res.status(500).json({ status: 'error', message: '無法更新數量' })
  }
})

// DELETE - 從購物車中移除商品
router.delete('/remove', authenticate, async (req, res) => {
  const user_id = req.user.id // 使用 authenticate 後的 user_id
  const { product_id, size } = req.body
  try {
    // 檢查該用戶的購物車中是否已存在該產品
    const [existingItem] = await sequelize.query(
      `SELECT * FROM cart WHERE user_id = ? AND product_id = ? AND size = ?`,
      {
        replacements: [user_id, product_id, size],
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (existingItem) {
      // 若產品存在於購物車中，刪除指定的購物車項目
      await sequelize.query(
        `DELETE FROM cart WHERE user_id = ? AND product_id = ? AND size = ?`,
        {
          replacements: [user_id, product_id, size],
          type: sequelize.QueryTypes.DELETE,
        }
      )
      return res.json({ status: 'success', message: '商品已從購物車中移除' })
    } else {
      return res
        .status(404)
        .json({ status: 'error', message: '該商品不存在購物車中' })
    }
  } catch (error) {
    console.error('無法刪除商品:', error)
    return res.status(500).json({ status: 'error', message: '無法刪除商品' })
  }
})

export default router
